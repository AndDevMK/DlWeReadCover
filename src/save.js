const fs = require('fs');
const path = require('path');

// 常量定义
const DEFAULT_OUTPUT_DIR = 'cover';
const FILENAME_INVALID_CHARS = /[\\/:*?"<>|]/g;
const FILENAME_REPLACEMENT = '_';

/**
 * 确保输出目录存在
 * @param {string} dir - 目录路径
 */
function ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[目录] 已创建文件夹: ${path.resolve(dir)}`);
    }
}

/**
 * 生成安全的文件名
 * @param {string} title - 书名
 * @param {number} index - 排名序号
 * @returns {string} 安全的文件名（不含扩展名）
 */
function generateSafeFileName(title, index) {
    if (!title || typeof title !== 'string') {
        throw new Error('书名不能为空');
    }
    if (!Number.isInteger(index) || index < 1) {
        throw new Error('序号必须是正整数');
    }

    const safeTitle = title.trim().replace(FILENAME_INVALID_CHARS, FILENAME_REPLACEMENT);
    return `${safeTitle}_Top${index}`;
}

/**
 * 保存Buffer为JPG文件
 * @param {Buffer} buffer - 图片Buffer
 * @param {string} fileName - 文件名（不含扩展名）
 * @param {string} outputDir - 输出目录
 * @returns {Promise<string>} 保存的文件路径
 */
async function saveJpg(buffer, fileName, outputDir = DEFAULT_OUTPUT_DIR) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('输入必须是Buffer类型');
    }
    if (!fileName) {
        throw new Error('文件名不能为空');
    }

    ensureDirectory(outputDir);

    const filePath = path.join(outputDir, `${fileName}.jpg`);
    const absolutePath = path.resolve(filePath);

    try {
        await fs.promises.writeFile(filePath, buffer);
        console.log(`[保存] 已保存: ${absolutePath} (${buffer.length} bytes)`);
        return absolutePath;
    } catch (err) {
        throw new Error(`保存文件失败 (${fileName}): ${err.message}`);
    }
}

/**
 * 批量保存图片
 * @param {Array<{title: string, author: string, readingCount: number, buffer: Buffer}>} images - 图片数组
 * @param {string} searchTitle - 搜索关键词（用于文件名前缀）
 * @param {string} outputDir - 输出目录
 * @returns {Promise<Array<string>>} 保存的文件路径数组
 */
async function saveImages(images, searchTitle, outputDir = DEFAULT_OUTPUT_DIR) {
    if (!Array.isArray(images)) {
        throw new Error('images必须是数组');
    }
    if (!searchTitle) {
        throw new Error('搜索关键词不能为空');
    }

    const safePrefix = searchTitle.trim().replace(FILENAME_INVALID_CHARS, FILENAME_REPLACEMENT);
    const savedPaths = [];

    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
            const fileName = `${safePrefix}_${generateSafeFileName(image.title, i + 1)}`;
            const filePath = await saveJpg(image.buffer, fileName, outputDir);
            savedPaths.push(filePath);
        } catch (err) {
            console.error(`[跳过] ${err.message}`);
        }
    }

    if (savedPaths.length === 0) {
        throw new Error('所有文件保存均失败');
    }

    console.log(`[完成] 成功保存 ${savedPaths.length}/${images.length} 张图片到 ${path.resolve(outputDir)}`);
    return savedPaths;
}

module.exports = {
    saveJpg,
    saveImages,
    ensureDirectory,
    generateSafeFileName
};