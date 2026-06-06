const tf = require('@tensorflow/tfjs-node');
const Upscaler = require('upscaler/node');
const x4 = require('@upscalerjs/esrgan-thick/4x');

// 常量定义
const PATCH_SIZE = 64; // 根据内存情况调整，较大值更快但耗内存
const PADDING = 4;

/**
 * 初始化Upscaler实例（单例模式，避免重复加载模型）
 */
let upscalerInstance = null;

function getUpscaler() {
    if (!upscalerInstance) {
        console.log('[超分] 正在初始化 UpscalerJS (esrgan-thick 4x)...');
        upscalerInstance = new Upscaler({
            model: x4
        });
        console.log('[超分] 模型初始化完成');
    }
    return upscalerInstance;
}

/**
 * 将Buffer转换为TensorFlow Tensor
 * @param {Buffer} imageBuffer - 图片Buffer
 * @returns {tf.Tensor3D} 解码后的图像Tensor
 */
function bufferToTensor(imageBuffer) {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new Error('输入必须是Buffer类型');
    }

    try {
        // decodeImage返回3D或4D tensor，需要squeeze去掉batch维度
        const tensor = tf.node.decodeImage(imageBuffer, 3); // 3通道RGB
        return tensor;
    } catch (err) {
        throw new Error(`Buffer转Tensor失败: ${err.message}`);
    }
}

/**
 * 将Tensor转换为Buffer（PNG格式，无损）
 * @param {tf.Tensor} tensor - 超分后的Tensor
 * @returns {Promise<<Buffer>} PNG Buffer
 */
async function tensorToBuffer(tensor) {
    try {
        const encoded = await tf.node.encodePng(tensor);
        return Buffer.from(encoded);
    } catch (err) {
        throw new Error(`Tensor转Buffer失败: ${err.message}`);
    }
}

/**
 * 在控制台同一行输出进度（适用于 Node.js）
 * @param {number} progress - 进度值，范围 0～1（如 0.232433435）
 * @param {string} [prefix='Progress'] - 可选，进度前缀文字
 */
function printProgress(progress) {
    // 边界处理
    const clamped = Math.min(1, Math.max(0, progress));
    // 格式化为百分比，固定两位小数，并补足宽度（防止残留字符）
    const percent = (clamped * 100).toFixed(2);
    const output = `[超分] 处理进度: ${percent}%`;
    // \r 将光标移到行首，实现覆盖
    process.stdout.write(`\r${output}`);
    // 进度为 100% 时换行
    if (clamped === 1) {
        process.stdout.write('\n');
    }
}

/**
 * 对单张图片进行4x超分
 * @param {Buffer} imageBuffer - 原始图片Buffer
 * @param {string} bookTitle - 书名（用于日志）
 * @returns {Promise<<Buffer>} 超分后的图片Buffer
 */
async function upscaleImage(imageBuffer, bookTitle = '未知书名') {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new Error(`[超分] 输入不是Buffer: ${bookTitle}`);
    }

    console.log(`[超分] 开始处理《${bookTitle}》: ${imageBuffer.length} bytes`);

    let inputTensor = null;
    let outputTensor = null;

    try {
        // 1. Buffer -> Tensor
        inputTensor = bufferToTensor(imageBuffer);
        const shape = inputTensor.shape;
        console.log(`[超分] 输入尺寸: ${shape[0]}x${shape[1]}, 开始4x超分...`);

        // 2. 执行超分
        const upscaler = getUpscaler();
        outputTensor = await upscaler.upscale(inputTensor, {
            output: 'tensor',  // base64 | tensor ——表示 UpscalerJS 返回的响应类型：要么是图像的 Base64 编码字符串，要么是张量数据。在浏览器中，默认值为 "base64" ；而在 Node.js 环境中，则默认为 "tensor" 。
            patchSize: PATCH_SIZE,  // 可选：指定要操作的图像块大小。
            padding: PADDING, // 可选地指定填充尺寸。
            progress: (progress) => {  // 如果 execute 被调用时带有 patchSize 参数，那么会返回此进度信息作为回调。
                printProgress(progress);
            },
        });

        // 3. Tensor -> Buffer
        const resultBuffer = await tensorToBuffer(outputTensor);
        const outputShape = outputTensor.shape;

        console.log(`[成功] 超分完成《${bookTitle}》: ${outputShape[0]}x${outputShape[1]} (${resultBuffer.length} bytes)`);

        return resultBuffer;

    } catch (err) {
        throw new Error(`超分失败 (${bookTitle}): ${err.message}`);
    } finally {
        // 必须释放Tensor内存，防止内存泄漏
        if (inputTensor) inputTensor.dispose();
        if (outputTensor) outputTensor.dispose();
    }
}

/**
 * 批量超分图片
 * @param {Array<{title: string, author: string, readingCount: number, buffer: Buffer}>} images - 图片Buffer数组
 * @returns {Promise<Array<{title: string, author: string, readingCount: number, buffer: Buffer}>>}
 */
async function upscaleImages(images) {
    if (!Array.isArray(images)) {
        throw new Error('images必须是数组');
    }

    const results = [];

    for (const image of images) {
        try {
            const upscaledBuffer = await upscaleImage(image.buffer, image.title);
            results.push({
                title: image.title,
                author: image.author,
                readingCount: image.readingCount,
                buffer: upscaledBuffer
            });
        } catch (err) {
            console.error(`[跳过] ${err.message}`);
            // 继续处理下一张
        }
    }

    if (results.length === 0) {
        throw new Error('所有图片超分均失败');
    }

    console.log(`[完成] 成功超分 ${results.length}/${images.length} 张图片`);
    return results;
}

/**
 * 清理Upscaler资源（程序退出前调用）
 */
function disposeUpscaler() {
    if (upscalerInstance) {
        // UpscalerJS内部会自动清理，但我们可以释放tfjs资源
        tf.engine().startScope(); // 清理所有未释放的tensor
        tf.engine().endScope();
        upscalerInstance = null;
        console.log('[超分] 已释放模型资源');
    }
}

module.exports = {
    upscaleImage,
    upscaleImages,
    disposeUpscaler,
    bufferToTensor,
    tensorToBuffer
};