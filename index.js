const { searchTop3Books } = require('./src/search');
const { downloadImagesBuffers } = require('./src/download');
const { upscaleImages, disposeUpscaler } = require('./src/upscale');
const { compressImages } = require('./src/compress');
const { saveImages } = require('./src/save');

/**
 * 主逻辑：搜索 -> 下载 -> 超分 -> 压缩 -> 保存
 * @param {string} title - 书名关键词
 * @param {string} author - 作者关键词（可选）
 */
async function processBookCovers(title, author = '') {
    const startTime = Date.now();

    try {
        // 1. 搜索Top3书籍
        const books = await searchTop3Books(title, author);

        // 2. 下载封面为Buffer
        const downloadedImages = await downloadImagesBuffers(books);

        // 3. 4x超分
        const upscaledImages = await upscaleImages(downloadedImages);

        // 4. 压缩体积（超分后的PNG Buffer → 高质量JPEG Buffer）
        const compressedImages = await compressImages(upscaledImages);

        // 5. 保存为JPG
        const savedPaths = await saveImages(compressedImages, title);

        // 统计
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n[全部完成] 耗时 ${duration}s，成功处理 ${savedPaths.length} 本书:`);
        savedPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

    } catch (err) {
        console.error(`[致命错误] 流程中断: ${err.message}`);
        process.exit(1);
    } finally {
        // 确保释放TensorFlow资源
        disposeUpscaler();
    }
}

// 命令行参数处理
const args = process.argv.slice(2);
if (args.length > 0) {
    const title = args[0];
    const author = args.length > 1 ? args[1] : '';
    processBookCovers(title, author);
} else {
    console.log('用法: node index.js <书名> [作者]');
}