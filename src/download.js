const axios = require('axios');

// 常量定义
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DOWNLOAD_TIMEOUT = 15000;
const HD_COVER_REPLACE_PATTERN = '/s_';
const HD_COVER_REPLACE_TARGET = '/t9_';

/**
 * 将微信封面URL转换为高清URL
 * @param {string} coverUrl - 原始封面URL
 * @returns {string} 高清封面URL
 */
function getHdCoverUrl(coverUrl) {
    if (!coverUrl || typeof coverUrl !== 'string') {
        throw new Error('封面URL不能为空');
    }
    return coverUrl.replace(HD_COVER_REPLACE_PATTERN, HD_COVER_REPLACE_TARGET);
}

/**
 * 下载图片并返回Buffer
 * @param {string} coverUrl - 封面URL
 * @param {string} bookTitle - 书名（用于日志）
 * @returns {Promise<<Buffer>} 图片Buffer
 * @throws {Error} 下载失败时抛出
 */
async function downloadImageBuffer(coverUrl, bookTitle = '未知书名') {
    if (!coverUrl) {
        throw new Error(`[警告] 封面地址为空，跳过下载: ${bookTitle}`);
    }

    const hdCoverUrl = getHdCoverUrl(coverUrl);
    console.log(`[下载] 正在下载《${bookTitle}》: ${hdCoverUrl}`);

    try {
        const response = await axios({
            url: hdCoverUrl,
            method: 'GET',
            responseType: 'arraybuffer', // 直接获取buffer
            headers: { 'User-Agent': USER_AGENT },
            timeout: DOWNLOAD_TIMEOUT,
            // 确保只接受图片类型
            validateStatus: (status) => status === 200
        });

        // 检查Content-Type是否为图片
        const contentType = response.headers['content-type'] || '';
        if (!contentType.startsWith('image/')) {
            throw new Error(`响应类型不是图片: ${contentType}`);
        }

        const buffer = Buffer.from(response.data);
        
        if (buffer.length === 0) {
            throw new Error('下载的图片数据为空');
        }

        console.log(`[成功] 已下载《${bookTitle}》: ${buffer.length} bytes`);
        return buffer;

    } catch (err) {
        if (err.response) {
            throw new Error(`下载封面失败 (${bookTitle}): HTTP ${err.response.status}`);
        }
        throw new Error(`下载封面失败 (${bookTitle}): ${err.message}`);
    }
}

/**
 * 批量下载图片Buffer
 * @param {Array<{coverUrl: string, title: string}>} books - 书籍信息数组
 * @returns {Promise<Array<{title: string, author: string, readingCount: number, buffer: Buffer}>>}
 */
async function downloadImagesBuffers(books) {
    if (!Array.isArray(books)) {
        throw new Error('books必须是数组');
    }

    const results = [];
    
    for (const book of books) {
        try {
            const buffer = await downloadImageBuffer(book.coverUrl, book.title);
            results.push({
                title: book.title,
                author: book.author,
                readingCount: book.readingCount,
                buffer
            });
        } catch (err) {
            console.error(`[跳过] ${err.message}`);
            // 继续处理下一本，不中断流程
        }
    }

    if (results.length === 0) {
        throw new Error('所有图片下载均失败');
    }

    console.log(`[完成] 成功下载 ${results.length}/${books.length} 张图片`);
    return results;
}

module.exports = {
    downloadImageBuffer,
    downloadImagesBuffers,
    getHdCoverUrl
};