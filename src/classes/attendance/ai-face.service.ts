import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import axios from 'axios';
import { StudentEntity } from '../../students/entities/student.entity';

export const DEFAULT_FACE_DISTANCE_THRESHOLD = 0.4375;
export const MIN_FACE_DISTANCE_THRESHOLD = 0.3;
export const MAX_FACE_DISTANCE_THRESHOLD = 0.55;
export const ALLOWED_FACE_MATCH_PERCENTAGES = [60, 65, 70, 75, 80, 85, 90, 95] as const;

const SIMILARITY_ANCHORS = [
  { distance: 0.0, score: 100 },
  { distance: 0.25, score: 95 },
  { distance: 0.4, score: 85 },
  { distance: DEFAULT_FACE_DISTANCE_THRESHOLD, score: 75 },
  { distance: 0.45, score: 70 },
  { distance: 0.5, score: 50 },
  { distance: 0.6, score: 20 },
  { distance: 0.7, score: 0 },
] as const;

/**
 * Hàm nghịch đảo của euclideanToMatchScore trong vùng 50-92%, là vùng chứa
 * toàn bộ các ngưỡng phần trăm cho phép.
 */
export function percentageToDistanceThreshold(percentage: number): number {
  if (percentage >= 92) {
    return ((100 - percentage) / 8) * 0.4;
  }

  return 0.4 + ((92 - percentage) / 42) * 0.1;
}

// TTL để tự động re-compute descriptor (7 ngày tính bằng ms)
const DESCRIPTOR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Kết quả so khớp khuôn mặt từ AiFaceService.
 */
export type FaceMatchResult = {
  isMatch: boolean;
  /** Phần trăm độ khớp [0–100], do hàm euclideanToMatchScore tính. */
  matchScore: number;
  /** Khoảng cách Euclidean gốc. */
  distance: number;
  threshold: number;
};

/**
 * Service xử lý nhận diện khuôn mặt phía Backend.
 *
 * Vì face-api.js yêu cầu môi trường DOM/Canvas để inference, service này
 * sử dụng thư viện `canvas` (node-canvas) để polyfill API cần thiết và
 * chạy model face-api hoàn toàn phía Node.js.
 *
 * Model files được load từ thư mục `models/` tại gốc backend project.
 * (Copy từ frontend/public/models hoặc tải từ nguồn vladmandic/face-api)
 */
@Injectable()
export class AiFaceService implements OnModuleInit {
  private readonly logger = new Logger(AiFaceService.name);
  private faceapi: any = null;
  private modelsLoaded = false;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
  ) {}

  /**
   * Khởi động service: load thư viện face-api và các model AI một lần duy nhất.
   * Chạy tự động khi NestJS khởi động module.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.loadFaceApiModels();
    } catch (err) {
      // Không ném lỗi để không block toàn bộ app — ghi log và tiếp tục.
      // Endpoint ai-verify sẽ trả ServiceUnavailableException nếu model chưa load.
      this.logger.error('Failed to load face-api models on startup', err);
    }
  }

  /**
   * Load canvas polyfill + face-api models.
   * Idempotent: chỉ load 1 lần, gọi lại nhiều lần vẫn an toàn.
   */
  private async loadFaceApiModels(): Promise<void> {
    if (this.modelsLoaded) return;

    this.logger.log('Loading face-api models for backend AI verification...');

    // Polyfill Canvas API cho Node.js (cần cài package 'canvas')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvasModule = require('canvas');

    // Nạp tfjs bản thuần JS và WASM thay vì tfjs-node (chống lỗi C++)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tensorflow/tfjs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tensorflow/tfjs-backend-wasm');

    // Nạp face-api bản node-wasm
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const faceapiModule = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

    const { Canvas, Image, ImageData, createCanvas, loadImage } = canvasModule;
    faceapiModule.env.monkeyPatch({ Canvas, Image, ImageData, createCanvas, loadImage });

    // Khởi tạo WASM backend trước khi thao tác
    await faceapiModule.tf.setBackend('wasm');
    await faceapiModule.tf.ready();

    this.faceapi = faceapiModule;

    // Model files: thư mục models/ tại gốc backend project
    // Cần copy từ frontend/public/models/ sang backend/models/
    const MODEL_PATH = path.join(process.cwd(), 'models');

    await Promise.all([
      faceapiModule.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
      faceapiModule.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH),
      faceapiModule.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
    ]);

    this.modelsLoaded = true;
    this.logger.log('face-api models (WASM backend) loaded successfully.');
  }

  /**
   * Lấy descriptor gốc của sinh viên từ DB, hoặc tự tính lại nếu chưa có / đã quá TTL 7 ngày.
   *
   * @param student Entity sinh viên cần lấy descriptor.
   * @returns Float32Array 128 chiều, hoặc null nếu không nhận diện được mặt trong ảnh.
   * @throws ServiceUnavailableException nếu không tải được ảnh từ API bên ngoài.
   */
  async getOrRefreshDescriptor(student: StudentEntity): Promise<number[]> {
    if (!this.modelsLoaded) {
      throw new ServiceUnavailableException(
        'AI face model chưa sẵn sàng. Vui lòng thử lại sau vài giây.',
      );
    }

    const now = Date.now();
    const syncedAt = student.faceDescriptorSyncedAt?.getTime() ?? 0;
    const isStale = now - syncedAt > DESCRIPTOR_TTL_MS;

    // Dùng descriptor đã cache nếu còn trong TTL
    if (student.faceDescriptor && student.faceDescriptor.length === 128 && !isStale) {
      return student.faceDescriptor;
    }

    // Cần tính (lần đầu hoặc đã quá TTL)
    this.logger.log(
      `Computing face descriptor for student ${student.mssv} (${isStale ? 'TTL expired' : 'first time'})`,
    );

    const imageUrl = `https://api.toolhub.app/hust/AnhDaiDien?mssv=${encodeURIComponent(student.mssv)}`;
    const descriptor = await this.extractDescriptorFromImageUrl(imageUrl, student.mssv);

    // Lưu vào DB
    await this.studentsRepository.update(
      { id: student.id },
      {
        faceDescriptor: Array.from(descriptor),
        faceDescriptorSyncedAt: new Date(),
      },
    );

    return Array.from(descriptor);
  }

  /**
   * Tải ảnh từ URL và trích xuất face descriptor bằng face-api.
   *
   * @param imageUrl URL ảnh cần xử lý.
   * @param mssv MSSV để log lỗi rõ ràng hơn.
   * @returns Float32Array 128 chiều.
   * @throws ServiceUnavailableException nếu không tải được ảnh.
   * @throws UnprocessableEntityException nếu ảnh không có khuôn mặt nhận diện được.
   */
  private async extractDescriptorFromImageUrl(
    imageUrl: string,
    mssv: string,
  ): Promise<Float32Array> {
    // Tải ảnh dưới dạng buffer
    let imageBuffer: Buffer;
    try {
      const response = await axios.get<Buffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      imageBuffer = Buffer.from(response.data);
    } catch (err) {
      this.logger.error(`Cannot fetch photo for mssv=${mssv}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        `Không thể tải ảnh thẻ sinh viên (${mssv}) từ hệ thống HUST. Vui lòng thử lại sau.`,
      );
    }

    // Dùng node-canvas để load ảnh
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadImage } = require('canvas');
    let img: any;
    try {
      img = await loadImage(imageBuffer);
    } catch (err) {
      throw new ServiceUnavailableException(
        `Không thể xử lý ảnh thẻ sinh viên (${mssv}). Định dạng ảnh không hợp lệ.`,
      );
    }

    // Chạy face-api inference
    const detection = await this.faceapi
      .detectSingleFace(img, new this.faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      this.logger.warn(`No face detected in reference photo for mssv=${mssv}`);
      throw new UnprocessableEntityException({
        error: 'NO_FACE_IN_REFERENCE',
        message: `Không nhận diện được khuôn mặt trong ảnh thẻ sinh viên (${mssv}). Ảnh thẻ có thể bị che hoặc không rõ.`,
      });
    }

    return detection.descriptor;
  }

  /**
   * Tính khoảng cách Euclidean giữa 2 descriptor vector.
   *
   * @param a Descriptor vector thứ nhất.
   * @param b Descriptor vector thứ hai.
   * @returns Khoảng cách Euclidean.
   */
  euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Chuyển khoảng cách Euclidean sang phần trăm khớp hiển thị cho người dùng.
   * Cùng thang đo phi tuyến như frontend để tương thích.
   *
   * @param distance Khoảng cách Euclidean.
   * @returns Phần trăm khớp [0, 100].
   */
  euclideanToMatchScore(distance: number): number {
    if (distance <= SIMILARITY_ANCHORS[0].distance) return 100;

    const lastAnchor = SIMILARITY_ANCHORS[SIMILARITY_ANCHORS.length - 1];
    if (distance >= lastAnchor.distance) return 0;

    for (let index = 1; index < SIMILARITY_ANCHORS.length; index += 1) {
      const left = SIMILARITY_ANCHORS[index - 1];
      const right = SIMILARITY_ANCHORS[index];

      if (distance <= right.distance) {
        const ratio = (distance - left.distance) / (right.distance - left.distance);
        return Math.round(left.score + ratio * (right.score - left.score));
      }
    }

    return 0;
  }

  /**
   * So khớp descriptor nhận từ Frontend với descriptor gốc trong DB.
   *
   * @param student Entity sinh viên cần xác minh.
   * @param liveDescriptor Descriptor từ camera frontend (128 số float).
   * @returns FaceMatchResult gồm isMatch, matchScore, distance.
   */
  async matchDescriptor(
    student: StudentEntity,
    liveDescriptor: number[],
    distanceThreshold = DEFAULT_FACE_DISTANCE_THRESHOLD,
  ): Promise<FaceMatchResult> {
    const referenceDescriptor = await this.getOrRefreshDescriptor(student);
    const distance = this.euclideanDistance(referenceDescriptor, liveDescriptor);
    const matchScore = this.euclideanToMatchScore(distance);
    const threshold = Math.min(
      MAX_FACE_DISTANCE_THRESHOLD,
      Math.max(MIN_FACE_DISTANCE_THRESHOLD, distanceThreshold),
    );
    const isMatch = distance <= threshold;

    return { isMatch, matchScore, distance, threshold };
  }
}
