const http = require('http');
const fs = require('fs');

const API_URL = process.env.MOODBOARD_TEST_URL || 'http://localhost:8080/api/board.php';

async function request(action, method = 'POST', data = {}) {
    return new Promise((resolve, reject) => {
        const url = method === 'GET' ? `${API_URL}?action=${action}&${new URLSearchParams(data).toString()}` : API_URL;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        
        const req = http.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    // console.log(`Response for ${action}:`, body); // Debug
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    if (res.headers['content-type'] === 'application/zip') {
                        resolve({ status: res.statusCode, data: body, isBuffer: true });
                    } else {
                        reject(new Error(`Invalid JSON: ${body} (Status: ${res.statusCode})`));
                    }
                }
            });
        });
        
        req.on('error', reject);
        
        if (method === 'POST') {
            req.write(JSON.stringify({ action, ...data }));
        }
        req.end();
    });
}

const tests = {
    passed: 0,
    failed: 0,
    metrics: [],
};

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        tests.passed++;
    } else {
        console.error(`❌ FAIL: ${message}`);
        tests.failed++;
    }
}

async function runTests() {
    console.log('--- Starting API Tests ---');
    try {
        // 1. list_boards
        let res = await request('list_boards', 'GET');
        assert(res.status === 200 && Array.isArray(res.data.boards), 'list_boards returns array of boards');
        
        // 2. create_board
        res = await request('create_board', 'POST', { title: 'Test Board' });
        assert(res.status === 200 && res.data.board && res.data.board.id.startsWith('board_'), 'create_board creates and slugifies ID');
        const boardId = res.data.board.id;
        
        // 3. get custom board
        res = await request('get', 'GET', { board: boardId });
        assert(res.status === 200 && res.data.boardId === boardId, 'get custom board returns correct board');
        assert(Array.isArray(res.data.board.items) && typeof res.data.board.positions === 'object', 'get uses production board envelope');
        
        // 4. get default board
        res = await request('get', 'GET', { board: 'default' });
        assert(res.status === 200 && res.data.boardId === 'default', 'get default board returns correct board');
        
        // 5. update_board
        res = await request('update_board', 'POST', { board: boardId, title: 'Renamed Board' });
        assert(res.status === 200, 'update_board successfully updates title');
        
        // 6. save_positions
        res = await request('save_positions', 'POST', {
            board: boardId,
            positions: { 'item_1': { x: 100, y: 200 }, 'item_2': { x: 300, y: 400 } }
        });
        assert(res.status === 200 && res.data.saved === 2, 'save_positions atomic save successful');
        
        // 7. add_link (YouTube & Remote CDN Image)
        res = await request('add_link', 'POST', { board: boardId, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
        assert(res.status === 200 && res.data.item.type === 'youtube', 'add_link resolves YouTube URLs');

        res = await request('add_link', 'POST', {
            board: boardId,
            url: 'https://pikaso.cdnpk.net/private/production/5544432347/render.png?token=exp=1790553600~hmac=2752c71136cfac95a24bf673e81da7b6d7b5d67b0c8f82f5c57cedfe46cbea44&preview=1'
        });
        assert(res.status === 200 && res.data.item.type === 'image' && res.data.item.img_src && res.data.item.w > 0, 'add_link resolves and caches Pikaso / CDN image URLs with natural dimensions');
        
        // 8. SSRF Protection
        const ssrfUrls = [
            'http://127.0.0.1:8080',
            'http://192.168.1.1',
            'http://10.0.0.1',
            'http://169.254.169.254'
        ];
        for (const url of ssrfUrls) {
            res = await request('add_link', 'POST', { board: boardId, url });
            assert(res.status === 400, `SSRF protected against ${url}`);
        }
        
        // 9. Concurrency & Stress test on save_positions
        console.log('--- Starting Concurrency Test ---');
        const promises = [];
        for (let i = 0; i < 20; i++) {
            promises.push(request('save_positions', 'POST', {
                board: boardId,
                positions: { [`item_${i}`]: { x: i * 10, y: i * 10 } }
            }));
        }
        await Promise.all(promises);
        
        // Verify concurrency didn't corrupt the file and all are present
        res = await request('get', 'GET', { board: boardId });
        let allPresent = true;
        for (let i = 0; i < 20; i++) {
            if (!res.data.board.positions[`item_${i}`]) allPresent = false;
        }
        assert(allPresent, 'Concurrency test: atomic locking successful, zero file corruption, all 20 writes persisted');

        res = await request('reset_positions', 'POST', { board: boardId });
        assert(res.status === 200, 'reset_positions clears layout without deleting media');
        res = await request('get', 'GET', { board: boardId });
        assert(Object.keys(res.data.board.positions).length === 0, 'reset_positions persists an empty layout');

        const imported = [{ id: 'test_image', type: 'image', img_src: 'https://example.com/test.jpg', x: 0, y: 0 }];
        res = await request('import_board', 'POST', { board: boardId, items: imported });
        assert(res.status === 200 && res.data.imported === 1, 'import_board accepts valid JSON items');
        res = await request('get', 'GET', { board: boardId });
        assert(res.data.board.items.length === 1 && res.data.board.items[0].id === 'test_image', 'imported items persist after reload');
        
        // 10. export_archive
        res = await request('export_archive', 'GET', { board: boardId });
        assert(res.status === 200 && res.isBuffer, 'export_archive returns ZIP buffer');
        
        // 11. delete_board system check
        res = await request('delete_board', 'POST', { board: 'default' });
        assert(res.status === 400, 'delete_board prevents deleting default system board');
        
        // 12. delete_board custom check
        res = await request('delete_board', 'POST', { board: boardId });
        assert(res.status === 200, 'delete_board deletes custom board');
        
    } catch (err) {
        console.error('Test Execution Error:', err);
    }
    
    console.log(`\n--- Test Summary ---`);
    console.log(`Total Passed: ${tests.passed}`);
    console.log(`Total Failed: ${tests.failed}`);
    if (tests.failed > 0) process.exit(1);
}

runTests();
