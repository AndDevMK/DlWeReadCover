const axios = require('axios');

// 常量定义
const SEARCH_BASE_URL = 'https://weread.qq.com/api/store/search';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 10000;

/**
 * 获取搜索所需的 sid 和 scope
 * @param {string} title - 书名关键词
 * @returns {Promise<{sid: string, scope: string}>}
 * @throws {Error} 当无法获取sid或scope时抛出
 */
async function getSearchMeta(title) {
    if (!title || typeof title !== 'string') {
        throw new Error('搜索关键词不能为空且必须为字符串');
    }

    const encodedTitle = encodeURIComponent(title.trim());
    const url = `${SEARCH_BASE_URL}?keyword=${encodedTitle}`;

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: REQUEST_TIMEOUT
        });

        const sid = data?.sid;
        if (!sid) {
            throw new Error('未从搜索结果中获取到 sid');
        }

        const ebookResult = (data?.results || []).find(item => item.type === 1);
        if (!ebookResult) {
            throw new Error('未找到电子书分类的 scope');
        }

        return { sid, scope: ebookResult.scope };
    } catch (err) {
        if (err.response) {
            throw new Error(`搜索请求失败: HTTP ${err.response.status} - ${err.response.statusText}`);
        }
        throw new Error(`搜索请求失败: ${err.message}`);
    }
}

/**
 * 获取书籍列表
 * @param {string} title - 书名关键词
 * @param {string} sid - 搜索会话ID
 * @param {string} scope - 搜索范围
 * @returns {Promise<Array>} 书籍列表
 */
async function getBookList(title, sid, scope) {
    const encodedTitle = encodeURIComponent(title.trim());
    const url = `${SEARCH_BASE_URL}?keyword=${encodedTitle}&sid=${sid}&scope=${scope}&count=20`;

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: REQUEST_TIMEOUT
        });

        const books = data?.results?.[0]?.books;
        if (!Array.isArray(books) || books.length === 0) {
            throw new Error('未找到相关书籍');
        }

        return books;
    } catch (err) {
        if (err.response) {
            throw new Error(`获取书籍列表失败: HTTP ${err.response.status}`);
        }
        throw new Error(`获取书籍列表失败: ${err.message}`);
    }
}

/**
 * 过滤并排序书籍，取阅读人数前3
 * @param {Array} books - 原始书籍列表
 * @param {string} title - 书名过滤关键词
 * @param {string} author - 作者过滤关键词（可选）
 * @returns {Array} 前3本书的bookInfo对象数组
 */
function filterAndSortBooks(books, title, author = '') {
    if (!Array.isArray(books)) {
        throw new Error('书籍列表必须是数组');
    }

    // 过滤：书名包含title，作者包含author（若提供）
    let matchedBooks = books.filter((book) => {
        const bookInfo = book?.bookInfo || {};
        const bookTitle = bookInfo.title || '';
        const bookAuthor = bookInfo.author || '';
        
        const titleMatch = bookTitle.includes(title);
        const authorMatch = author ? bookAuthor.includes(author) : true;
        return titleMatch && authorMatch;
    });

    // 若无匹配，回退到全部书籍（但保留警告）
    if (matchedBooks.length === 0) {
        console.warn(`[提示] 没有同时满足书名"${title}"和作者"${author}"的书籍，将使用全部书籍`);
        matchedBooks = books;
    }

    // 按阅读人数降序，取前3，确保有bookInfo
    const sortedBooks = matchedBooks
        .filter((book) => book?.bookInfo)
        .sort((a, b) => (b.readingCount || 0) - (a.readingCount || 0))
        .slice(0, 3);

    return sortedBooks.map(book => ({
        title: book.bookInfo.title || '未知书名',
        author: book.bookInfo.author || '未知作者',
        readingCount: book.readingCount || 0,
        coverUrl: book.bookInfo.cover || null
    }));
}

/**
 * 搜索微信读书并返回Top3书籍信息
 * @param {string} title - 书名关键词
 * @param {string} author - 作者关键词（可选）
 * @returns {Promise<Array<{title: string, author: string, readingCount: number, coverUrl: string}>>}
 */
async function searchTop3Books(title, author = '') {
    console.log(`[搜索] 开始搜索: "${title}" ${author ? `(作者: ${author})` : ''}`);
    
    const { sid, scope } = await getSearchMeta(title);
    console.log(`[信息] 获取到 sid: ${sid}, scope: ${scope}`);
    
    const books = await getBookList(title, sid, scope);
    console.log(`[信息] 获取到 ${books.length} 本候选书籍`);
    
    const top3 = filterAndSortBooks(books, title, author);
    
    if (top3.length === 0) {
        throw new Error('没有可用的书籍信息');
    }

    console.log(`[结果] 筛选出 Top ${top3.length} 本书:`);
    top3.forEach((book, i) => {
        console.log(`  [${i + 1}] 《${book.title}》 作者: ${book.author} 阅读人数: ${book.readingCount}`);
    });

    return top3;
}

module.exports = {
    searchTop3Books,
    getSearchMeta,
    getBookList,
    filterAndSortBooks
};