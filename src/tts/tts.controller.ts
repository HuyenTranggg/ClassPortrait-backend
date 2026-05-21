import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import * as https from 'https';
import * as http from 'http';

const MAX_TEXT_LENGTH = 200;

/**
 * Proxy Google Translate TTS để phát âm tiếng Việt.
 * Endpoint này PUBLIC (không yêu cầu đăng nhập) vì giám thị
 * truy cập qua share link cũng cần dùng giọng nói.
 */
@ApiTags('tts')
@Controller('tts')
export class TtsController {
  @Public()
  @Get('speak')
  @ApiOperation({ summary: 'Proxy Google Translate TTS để phát âm tiếng Việt' })
  @ApiQuery({ name: 'text', description: 'Văn bản cần đọc (tối đa 200 ký tự)', required: true })
  @ApiQuery({ name: 'lang', description: 'Ngôn ngữ (mặc định vi)', required: false, example: 'vi' })
  async speak(
    @Query('text') text: string,
    @Query('lang') lang = 'vi',
    @Res() res: Response,
  ) {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Tham số text không được để trống');
    }

    const sanitized = text.trim().slice(0, MAX_TEXT_LENGTH);
    const safeLang = /^[a-z]{2}(-[A-Z]{2})?$/.test(lang) ? lang.split('-')[0] : 'vi';

    const encoded = encodeURIComponent(sanitized);
    // Sử dụng Google Translate TTS (cùng giọng với Google Dịch)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${safeLang}&client=tw-ob&ttsspeed=1`;

    const requestFn = url.startsWith('https') ? https : http;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache 1 giờ để giảm request

    const req = requestFn.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': '*/*',
      },
    }, (googleRes) => {
      if (googleRes.statusCode !== 200) {
        res.status(502).json({ message: 'Google TTS không phản hồi' });
        return;
      }
      googleRes.pipe(res);
    });

    req.on('error', (err) => {
      console.error('[TTS] Google TTS error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ message: 'Không thể kết nối Google TTS' });
      }
    });

    req.setTimeout(5000, () => {
      req.destroy();
      if (!res.headersSent) {
        res.status(504).json({ message: 'Google TTS timeout' });
      }
    });
  }
}
