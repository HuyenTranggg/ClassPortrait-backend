import { BadRequestException, ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { verifyShareLinkSignature } from '../../common/utils/share-link-signature.util';

@Injectable()
export class ShareLinkSignatureMiddleware implements NestMiddleware {
  /**
   * Xác thực query exp/sig cho link chia sẻ trước khi vào controller.
   * @param req HTTP request hiện tại.
   * @param res HTTP response hiện tại.
   * @param next Hàm chuyển sang middleware/handler tiếp theo.
   * @returns Không trả dữ liệu; gọi next() khi hợp lệ, throw exception khi không hợp lệ.
   */
  use(req: Request, res: Response, next: NextFunction): void {
    const shareId = String(req.params.id ?? '').trim();
    const expRaw = String(req.query.exp ?? '').trim();
    const sig = String(req.query.sig ?? '').trim();

    if (!shareId) {
      throw new BadRequestException('Thiếu id trong đường dẫn link chia sẻ');
    }

    if (!expRaw || !sig) {
      throw new BadRequestException('Thiếu exp hoặc sig trong query của link chia sẻ');
    }

    const exp = Number(expRaw);
    if (!Number.isInteger(exp) || exp <= 0) {
      throw new BadRequestException('exp phải là unix timestamp milliseconds hợp lệ');
    }

    const isValid = verifyShareLinkSignature(shareId, exp, sig);
    if (!isValid) {
      throw new ForbiddenException('Link chia sẻ không hợp lệ hoặc đã hết hạn');
    }

    // Gắn dữ liệu đã qua kiểm tra vào request để handler có thể dùng lại nếu cần.
    (req as any).shareLinkSignature = { shareId, exp, sig };
    next();
  }
}
