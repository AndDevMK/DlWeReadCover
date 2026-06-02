const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * 下载单张封面
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
            timeout: 15000
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
 * @param {string} title - 书名关键词
 * @param {string} author - 作者关键词（可选，仅用于过滤）
 */
async function downloadTop3Covers(title, author = '') {
    const coverDir = 'cover';
    if (!fs.existsSync(coverDir)) {
        fs.mkdirSync(coverDir, { recursive: true });
        console.log(`[目录] 已创建文件夹: ${coverDir}`);
    }

    const encodedTitle = encodeURIComponent(title);
    const initialSearchUrl = `https://weread.qq.com/api/store/search?keyword=${encodedTitle}`;

    console.log(`[搜索] 第一次搜索: "${title}"`);

    // 第一步：获取 sid 和 scope
    let searchResult;
    try {
        const { data } = await axios.get(initialSearchUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        searchResult = data;
    } catch (err) {
        console.error(`[错误] 搜索请求失败: ${err.message}`);
        return;
    }

    const sid = searchResult?.sid;
    if (!sid) {
        console.error('[错误] 未从搜索结果中获取到 sid');
        return;
    }

    const ebookResult = (searchResult?.results || []).find(item => item.type === 1);
    if (!ebookResult) {
        console.error('[错误] 未找到电子书分类的 scope');
        return;
    }
    const scope = ebookResult.scope;

    console.log(`[信息] 获取到 sid: ${sid}, scope: ${scope}`);

    // 第二步：获取书籍列表
    const bookListUrl = `https://weread.qq.com/api/store/search?keyword=${encodedTitle}&sid=${sid}&scope=${scope}&count=20`;
    console.log(`[搜索] 第二次搜索，获取书籍列表...`);

    let bookListData;
    try {
        const { data } = await axios.get(bookListUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        bookListData = data;
    } catch (err) {
        console.error(`[错误] 获取书籍列表失败: ${err.message}`);
        return;
    }

    const books = bookListData?.results?.[0]?.books;
    if (!books || !Array.isArray(books) || books.length === 0) {
        console.log('未找到相关书籍');
        return;
    }

    // 过滤：书名包含 title，作者包含 author（若提供了 author）
    let matchedBooks = books.filter((book) => {
        const bookTitle = book?.bookInfo?.title || '';
        const bookAuthor = book?.bookInfo?.author || '';
        const titleMatch = bookTitle.includes(title);
        const authorMatch = author ? bookAuthor.includes(author) : true;
        return titleMatch && authorMatch;
    });

    if (matchedBooks.length === 0) {
        console.warn('[提示] 没有同时满足书名和作者的书籍，将使用全部书籍');
        matchedBooks = books;
    }

    // 按阅读人数降序排序，取前3
    const sortedBooks = matchedBooks
        .filter((book) => book?.bookInfo)
        .sort((a, b) => (b.readingCount || 0) - (a.readingCount || 0));

    const top3 = sortedBooks.slice(0, 3);

    if (top3.length === 0) {
        console.log('没有可用的书籍信息');
        return;
    }

    console.log(`[结果] 找到 ${top3.length} 本书，开始下载封面...`);

    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

    // 依次下载封面
    for (let i = 0; i < top3.length; i++) {
        const book = top3[i];
        const bookInfo = book.bookInfo;
        const bookTitle = bookInfo?.title || '未知书名';
        const readingCount = book.readingCount || 0;
        const cover = bookInfo?.cover;

        console.log(`[${i + 1}] 《${bookTitle}》 作者: ${bookInfo?.author || '未知'} 阅读人数: ${readingCount}`);

        if (!cover) {
            console.warn(`[警告] 《${bookTitle}》没有封面信息，跳过`);
            continue;
        }

        const fileName = path.join(coverDir, `${safeTitle}_Top${i + 1}.jpg`);
        await downloadCover(cover, fileName);
    }

    console.log('[完成] 所有任务执行完毕');
}

// 命令行参数处理
const args = process.argv.slice(2);
if (args.length > 0) {
    const title = args[0];
    const author = args.length > 1 ? args[1] : '';
    downloadTop3Covers(title, author);
} else {
    console.log('用法: node index.js <书名> [作者]');
}