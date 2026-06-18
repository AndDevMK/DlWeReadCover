const sharp = require('sharp');

// 常量：视觉无损的常用质量值，配合mozjpeg可极大压缩体积
const JPEG_QUALITY = 85;

/**
 * 压缩单张图片Buffer
 * 将超分后的PNG/JPEG Buffer转为高质量JPEG，极大减小体积
 * @param {Buffer} buffer - 图片Buffer
 * @param {string} bookTitle - 书名（用于日志）
 * @returns {Promise<<Buffer>} 压缩后的JPEG Buffer
 */
async function compressImage(buffer, bookTitle = '未知书名') {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error(`[压缩] 输入不是Buffer: ${bookTitle}`);
    }

    try {
        const compressedBuffer = await sharp(buffer)
            .jpeg({
                quality: JPEG_QUALITY,           // 视觉无损质量
                progressive: true,               // 渐进式JPEG，加载体验更好
                mozjpeg: true,                   // 启用mozjpeg优化，体积更小
                optimizeCoding: true,            // 优化霍夫曼编码
                chromaSubsampling: '4:2:0'       // 色度子采样，人眼不敏感，可显著减小体积
            })
            .toBuffer();

        const ratio = ((1 - compressedBuffer.length / buffer.length) * 100).toFixed(1);

        return compressedBuffer;
    } catch (err) {
        throw new Error(`压缩失败 (${bookTitle}): ${err.message}`);
    }
}

/**
 * 批量压缩图片
 * @param {Array<{title: string, author: string, readingCount: number, buffer: Buffer}>} images
 * @returns {Promise<Array<{title: string, author: string, readingCount: number, buffer: Buffer}>>}
 */
async function compressImages(images, onStepProgress = null) {
    if (!Array.isArray(images)) {
        throw new Error('images必须是数组');
    }

    const results = [];
    const total = images.length;

    for (let i = 0; i < total; i++) {
        const image = images[i];
        try {
            const compressedBuffer = await compressImage(image.buffer, image.title);
            results.push({
                title: image.title,
                author: image.author,
                readingCount: image.readingCount,
                buffer: compressedBuffer
            });
            if (onStepProgress) {
                onStepProgress((i + 1) / total);
            }
        } catch (err) {
            // 继续处理下一张
        }
    }

    if (results.length === 0) {
        throw new Error('所有图片压缩均失败');
    }

    return results;
}

module.exports = {
    compressImage,
    compressImages
};