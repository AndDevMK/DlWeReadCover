const { searchTop3Books } = require('./src/tasks/search');
const { downloadImagesBuffers } = require('./src/tasks/download');
const { upscaleImages, disposeUpscaler } = require('./src/tasks/upscale');
const { compressImages } = require('./src/tasks/compress');
const { saveImages } = require('./src/tasks/save');
const { Progress } = require('./src/utils/progress');

/**
 * 主逻辑：搜索 -> 下载 -> 超分 -> 压缩 -> 保存
 * @param {string} title - 书名关键词
 * @param {string} author - 作者关键词（可选）
 */
async function processBookCovers(title, author = '') {
    const startTime = Date.now();

    // 定义各步骤权重（总和为1）
    const stepWeights = {
        '搜索Top3书籍': 0.10,
        '下载封面': 0.10,
        '4x超分': 0.70,
        '压缩体积': 0.05,
        '保存为JPG': 0.05
    };
    // 创建进度管理器
    const progress = new Progress(stepWeights);
    progress.start();

    try {
        // 1. 搜索Top3书籍
        const books = await progress.runStep('搜索Top3书籍', async (onProgress) => {
            return await searchTop3Books(title, author, onProgress);
        });

        // 2. 下载封面为Buffer
        const downloaded = await progress.runStep('下载封面', async (onProgress) => {
            return await downloadImagesBuffers(books, onProgress);
        });

        // 3. 4x超分
        const upscaled = await progress.runStep('4x超分', async (onProgress) => {
            return await upscaleImages(downloaded, onProgress);
        });

        // 4. 压缩体积（超分后的PNG Buffer → 高质量JPEG Buffer）
        const compressed = await progress.runStep('压缩体积', async (onProgress) => {
            return await compressImages(upscaled, onProgress);
        });

        // 5. 保存为JPG
        const savedPaths = await progress.runStep('保存为JPG', async (onProgress) => {
            return await saveImages(compressed, title, onProgress);
        });

        progress.stop();

        // 统计
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n[全部完成] 耗时 ${duration}s，成功处理 ${savedPaths.length} 本书:`);
        savedPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

    } catch (err) {
        progress.stop();
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