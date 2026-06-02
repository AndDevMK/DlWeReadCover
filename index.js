const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * 下载单张封面
 * @param {string} coverUrl - 原始封面URL
 * @param {string} fileName - 保存文件名（含路径）
 * @returns {Promise<void>}
 */
async function downloadCover(coverUrl, fileName) {
    if (!coverUrl) {
        console.warn(`[警告] 封面地址为空，跳过下载: ${fileName}`);
        return;
    }

    const hdCoverUrl = coverUrl.replace('/s_', '/t9_');
    console.log(`[下载] 正在下载: ${hdCoverUrl}`);

    try {
        const response = await axios({
            url: hdCoverUrl,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000 // 15秒超时
        });

        const writer = fs.createWriteStream(fileName);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`[成功] 封面已保存: ${fileName}`);
                resolve();
            });
            writer.on('error', (err) => {
                console.error(`[错误] 写入文件失败 (${fileName}): ${err.message}`);
                reject(err);
            });
            response.data.on('error', (err) => {
                console.error(`[错误] 下载流错误 (${fileName}): ${err.message}`);
                reject(err);
            });
        });
    } catch (err) {
        console.error(`[错误] 下载封面失败 (${fileName}): ${err.message}`);
    }
}

/**
 * 主逻辑：搜索并下载阅读人数前三的书籍封面
 * @param {string} keyword - 搜索关键词
 */
async function downloadTop3Covers(keyword) {
    // 确保 cover 文件夹存在
    const coverDir = 'cover';
    if (!fs.existsSync(coverDir)) {
        fs.mkdirSync(coverDir, { recursive: true });
        console.log(`[目录] 已创建文件夹: ${coverDir}`);
    }

    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://weread.qq.com/api/store/search?keyword=${encodedKeyword}`;

    console.log(`[搜索] 正在搜索: "${keyword}"`);

    let booksData;
    try {
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        booksData = data;
    } catch (err) {
        console.error(`[错误] 搜索请求失败: ${err.message}`);
        return;
    }

    const books = booksData?.results?.[0]?.books;
    if (!books || books.length === 0) {
        console.log('未找到相关书籍');
        return;
    }

    // 筛选 title 包含关键词的书籍，若没有则使用全部
    let matchedBooks = books.filter((book) => {
        const title = book?.bookInfo?.title || '';
        return title.includes(keyword);
    });

    if (matchedBooks.length === 0) {
        console.warn('[提示] 未找到标题完全包含关键词的书籍，将使用搜索结果中的所有书籍');
        matchedBooks = books;
    }

    // 按阅读人数降序排序，有效阅读人数处理
    const sortedBooks = matchedBooks
        .filter((book) => book?.bookInfo) // 保证 bookInfo 存在
        .sort((a, b) => (b.readingCount || 0) - (a.readingCount || 0));

    const top3 = sortedBooks.slice(0, 3);

    if (top3.length === 0) {
        console.log('没有可用的书籍信息');
        return;
    }

    console.log(`[结果] 找到 ${top3.length} 本书，开始下载封面...`);

    // 依次下载封面
    for (let i = 0; i < top3.length; i++) {
        const book = top3[i];
        const bookInfo = book.bookInfo;
        const title = bookInfo?.title || '未知书名';
        const readingCount = book.readingCount || 0;
        const cover = bookInfo?.cover;

        console.log(`[${i + 1}] 《${title}》 阅读人数: ${readingCount}`);

        if (!cover) {
            console.warn(`[警告] 《${title}》没有封面信息，跳过`);
            continue;
        }

        const safeKeyword = keyword.replace(/[\\/:*?"<>|]/g, '_'); // 去除文件名非法字符
        const fileName = path.join(coverDir, `${safeKeyword}_Top${i + 1}.jpg`);

        await downloadCover(cover, fileName);
    }

    console.log('[完成] 所有任务执行完毕');
}

// 命令行参数处理
const args = process.argv.slice(2);
if (args.length > 0) {
    downloadTop3Covers(args[0]);
} else {
    console.log('用法: node index.js <书名>');
}