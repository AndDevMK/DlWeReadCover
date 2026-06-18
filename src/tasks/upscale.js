const tf = require('@tensorflow/tfjs-node');
const Upscaler = require('upscaler/node');

// 常量定义
const PADDING = 4;

/**
 * 初始化Upscaler实例（单例模式，避免重复加载模型）
 */
let upscalerInstance = null;

function getUpscaler() {
    if (!upscalerInstance) {
        upscalerInstance = new Upscaler({
            model: {
                scale: 4,
                modelType: 'graph', // UpscalerJS 默认按 layers 模型加载，但 web-realesrgan 是 graph 模型，两者 JSON 格式完全不同。需要显式告诉 UpscalerJS 这是 graph 类型。
                path: tf.io.fileSystem('models/Real-CUGAN/4x/model.json'),   // 模型来自：https://github.com/xororz/web-realesrgan，降噪等级为conservative，也就是保守型：这通常意味着采用一种温和或保守的降噪方式。也就是说，该方式会尽量保留原始图像的细节，避免过度平滑处理。
                preprocess: (input) => tf.tidy(() => {  // 这是一个在将输入图像输入模型之前对其进行处理的函数。例如，如果你需要对输入图像进行某种处理以使其符合模型要求，就可以使用这个函数。
                    // 因为输入图片的像素值是 int32 类型（0-255 整数），但模型要求 float32 类型。需要在预处理中显式转换。不然报错：The dtype of dict['input'] provided in model.execute(dict) must be float32, but was int32
                    // 先转 float32，再归一化到 [0, 1]
                    return tf.cast(input, 'float32').div(255);
                }),
                postprocess: (output) => tf.tidy(() => { // 这是一个在图像经过模型推理处理后对其进行进一步处理的函数。例如，你可能需要将浮点数转换为 0 到 255 之间的整数。
                    // 输出反归一化到 [0, 255]，并转回 int32
                    return output.clipByValue(0, 1).mul(255);
                }),
            },
        });
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
async function upscaleImage(imageBuffer, bookTitle = '未知书名', onProgress) {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new Error(`[超分] 输入不是Buffer: ${bookTitle}`);
    }

    let inputTensor = null;
    let outputTensor = null;

    try {
        // 1. Buffer -> Tensor
        inputTensor = bufferToTensor(imageBuffer);
        const shape = inputTensor.shape;

        // 2. 执行超分
        const upscaler = getUpscaler();
        outputTensor = await upscaler.upscale(inputTensor, {
            output: 'tensor',  // base64 | tensor ——表示 UpscalerJS 返回的响应类型：要么是图像的 Base64 编码字符串，要么是张量数据。在浏览器中，默认值为 "base64" ；而在 Node.js 环境中，则默认为 "tensor" 。
            // 模型中已定义了patchSize，那么这里就不需要重复设置了，否则出现警告信息：You have provided a patchSize, but the model definition already includes an input size. Your patchSize will be ignored.
            // patchSize: PATCH_SIZE,  // 可选：指定要操作的图像块大小。
            padding: PADDING, // 可选地指定填充尺寸。
            progress: (progress) => {  // 如果 execute 被调用时带有 patchSize 参数，那么会返回此进度信息作为回调。
                if (onProgress) onProgress(progress);
            },
        });

        // 3. Tensor -> Buffer
        const resultBuffer = await tensorToBuffer(outputTensor);
        const outputShape = outputTensor.shape;

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
async function upscaleImages(images, onStepProgress = null) {
    if (!Array.isArray(images)) {
        throw new Error('images必须是数组');
    }

    const results = [];
    const total = images.length;

    for (let i = 0; i < total; i++) {
        const image = images[i];
        try {
            const onSingleProgress = (innerProgress) => {
                if (onStepProgress) {
                    const stepOverall = (i + innerProgress) / total;
                    onStepProgress(stepOverall);
                }
            };
            const upscaledBuffer = await upscaleImage(image.buffer, image.title, onSingleProgress);
            results.push({
                title: image.title,
                author: image.author,
                readingCount: image.readingCount,
                buffer: upscaledBuffer
            });
        } catch (err) {
            // 继续处理下一张
        }
    }

    if (results.length === 0) {
        throw new Error('所有图片超分均失败');
    }

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
    }
}

module.exports = {
    upscaleImage,
    upscaleImages,
    disposeUpscaler,
    bufferToTensor,
    tensorToBuffer
};