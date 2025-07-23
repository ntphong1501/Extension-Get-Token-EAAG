document.addEventListener('DOMContentLoaded', function() {
    const tokenInput = document.getElementById('TokenValue');
    const extractBtn = document.getElementById('extractBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const status = document.getElementById('status');

    // Load saved value khi popup mở
    loadSavedValue();

    // Lắng nghe tin nhắn từ content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'tokenFound' || message.action === 'tokenUpdated') {
            tokenInput.value = message.token;
            status.textContent = 'Token được cập nhật tự động!';
            status.className = 'status success';
        }
    });

    // Click vào textbox để copy
    tokenInput.addEventListener('click', function() {
        if (tokenInput.value.trim()) {
            copyToClipboard(tokenInput.value);
        }
    });

    // Nút lấy giá trị - SILENT FETCH
    extractBtn.addEventListener('click', extractTokenSilently);

    // Nút làm mới
    refreshBtn.addEventListener('click', function() {
        tokenInput.value = '';
        status.textContent = 'Đã xóa dữ liệu';
        status.className = 'status';
        chrome.storage.local.clear();
    });

    async function extractTokenSilently() {
        try {
            // Hiển thị loading
            status.innerHTML = '<span class="loading"></span> Đang lấy token ngầm...';
            status.className = 'status';
            extractBtn.disabled = true;

            console.log('🚀 Bắt đầu silent fetch...');

            // Method 1: Thử Background Script fetch
            let result = await tryBackgroundFetch();
            
            if (!result.success) {
                // Method 2: Thử Offscreen Document
                status.innerHTML = '<span class="loading"></span> Đang thử phương pháp khác...';
                result = await tryOffscreenFetch();
            }
            
            if (!result.success) {
                // Method 3: Thử inject vào tab hiện tại (nếu đang ở Facebook)
                result = await tryCurrentTabExtraction();
            }

            // Hiển thị kết quả
            if (result.success && result.token) {
                tokenInput.value = result.token;
                status.textContent = `✅ Lấy thành công! (${result.method || 'unknown'})`;
                status.className = 'status success';
                
                // Lưu vào storage
                chrome.storage.local.set({ 
                    tokenValue: result.token,
                    extractTime: result.timestamp || new Date().toISOString(),
                    source: result.source || 'unknown',
                    method: result.method || 'unknown'
                });
                
                // Validate token
                validateToken(result.token);
                
                console.log('🎉 Token extracted successfully:', result.token.substring(0, 30) + '...');
            } else {
                status.textContent = `❌ ${result.error || 'Không thể lấy token'}`;
                status.className = 'status error';
                
                // Hiển thị hướng dẫn backup
                showBackupInstructions();
            }

        } catch (error) {
            console.error('❌ Silent fetch error:', error);
            status.textContent = '❌ Có lỗi xảy ra: ' + error.message;
            status.className = 'status error';
        } finally {
            extractBtn.disabled = false;
        }
    }

    async function tryBackgroundFetch() {
        try {
            console.log('🔄 Thử background fetch...');
            
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchTokenSilently' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('❌ Background fetch error:', chrome.runtime.lastError);
                            resolve({ 
                                success: false, 
                                error: 'Background script không khả dụng',
                                method: 'background_fetch'
                            });
                        } else {
                            console.log('✅ Background fetch response:', response?.success);
                            resolve({
                                ...response,
                                method: 'background_fetch'
                            });
                        }
                    }
                );
            });
        } catch (error) {
            console.log('❌ Background fetch exception:', error);
            return { 
                success: false, 
                error: error.message,
                method: 'background_fetch'
            };
        }
    }

    async function tryOffscreenFetch() {
        try {
            console.log('🔄 Thử offscreen fetch...');
            
            // Tạo offscreen document nếu chưa có
            await ensureOffscreenDocument();
            
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { 
                        action: 'fetchTokenOffscreen',
                        targetUrl: 'https://business.facebook.com/business_locations/'
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('❌ Offscreen fetch error:', chrome.runtime.lastError);
                            resolve({ 
                                success: false, 
                                error: 'Offscreen document không khả dụng',
                                method: 'offscreen_fetch'
                            });
                        } else {
                            console.log('✅ Offscreen fetch response:', response?.success);
                            resolve({
                                ...response,
                                method: 'offscreen_fetch'
                            });
                        }
                    }
                );
            });
        } catch (error) {
            console.log('❌ Offscreen fetch exception:', error);
            return { 
                success: false, 
                error: error.message,
                method: 'offscreen_fetch'
            };
        }
    }

    async function tryCurrentTabExtraction() {
        try {
            console.log('🔄 Thử current tab extraction...');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Chỉ thử nếu đang ở Facebook
            if (!tab.url.includes('facebook.com')) {
                return { 
                    success: false, 
                    error: 'Không ở trang Facebook',
                    method: 'current_tab'
                };
            }

            // Inject và extract
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: extractTokenFromCurrentPage
            });

            if (result.result) {
                return {
                    success: true,
                    token: result.result,
                    source: tab.url,
                    timestamp: new Date().toISOString(),
                    method: 'current_tab_injection'
                };
            } else {
                return { 
                    success: false, 
                    error: 'Không tìm thấy token trong tab hiện tại',
                    method: 'current_tab'
                };
            }

        } catch (error) {
            console.log('❌ Current tab extraction error:', error);
            return { 
                success: false, 
                error: error.message,
                method: 'current_tab'
            };
        }
    }

    function extractTokenFromCurrentPage() {
        try {
            const html = document.documentElement.outerHTML;
            console.log('🔍 Extracting from current page, HTML length:', html.length);
            
            // Patterns được cập nhật cho business_locations
            const patterns = [
                // Pattern chính cho business_locations
                /\["[^"]*","(EAAG[A-Za-z0-9_-]{100,})","[^"]*"/gi,
                /,"(EAAG[A-Za-z0-9_-]{100,})",/gi,
                /\["(EAAG[A-Za-z0-9_-]{100,})"/gi,
                
                // Patterns cũ
                /"apiAccessToken"\s*:\s*"(EAAG[^"]+)"/gi,
                /"accessToken"\s*:\s*"(EAAG[^"]+)"/gi,
                /EAAG[A-Za-z0-9_-]{100,}/gi
            ];
            
            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                console.log(`🔍 Trying pattern ${i + 1}`);
                
                const matches = Array.from(html.matchAll(pattern));
                console.log(`Found ${matches.length} matches`);
                
                for (let match of matches) {
                    let token = match[1] || match[0];
                    token = token.replace(/['",:[\]]/g, '').trim();
                    
                    console.log(`🔍 Checking: ${token.substring(0, 30)}... (length: ${token.length})`);
                    
                    if (token.startsWith('EAAG') && token.length >= 100 && token.length <= 300) {
                        if (/^EAAG[A-Za-z0-9_-]+$/.test(token)) {
                            console.log('✅ Valid token found:', token.substring(0, 30) + '...');
                            return token;
                        }
                    }
                }
            }
            
            console.log('❌ No token found');
            return null;
        } catch (error) {
            console.error('Extract error:', error);
            return null;
        }
    }

    async function ensureOffscreenDocument() {
        try {
            // Kiểm tra xem offscreen document đã tồn tại chưa
            const existingContexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT']
            });

            if (existingContexts.length > 0) {
                console.log('✅ Offscreen document đã tồn tại');
                return;
            }

            // Tạo offscreen document mới
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['DOM_SCRAPING'],
                justification: 'Scrape DOM to extract Facebook Business token'
            });

            console.log('✅ Đã tạo offscreen document');
        } catch (error) {
            console.error('❌ Lỗi tạo offscreen document:', error);
            throw error;
        }
    }

    function showBackupInstructions() {
        const instructions = document.createElement('div');
        instructions.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 280px;
            font-size: 12px;
            z-index: 10000;
            text-align: left;
        `;
        
        instructions.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #ffd700;">🔧 Hướng dẫn backup:</h3>
            <p>1. Mở <strong>business.facebook.com/business_locations/</strong> trong tab mới</p>
            <p>2. Đăng nhập vào tài khoản</p>
            <p>3. Quay lại extension và thử lại</p>
            <p style="margin-top: 15px;">
                <button id="closeInstructions" style="
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                ">Đã hiểu</button>
            </p>
        `;
        
        document.body.appendChild(instructions);
        
        document.getElementById('closeInstructions').onclick = () => {
            document.body.removeChild(instructions);
        };
        
        // Auto remove sau 10 giây
        setTimeout(() => {
            if (document.body.contains(instructions)) {
                document.body.removeChild(instructions);
            }
        }, 10000);
    }

    function validateToken(token) {
        if (!token) return false;
        
        if (!token.startsWith('EAAG')) {
            status.textContent = '⚠️ Token có vẻ không đúng định dạng';
            status.className = 'status error';
            return false;
        }
        
        if (token.length < 100) {
            status.textContent = '⚠️ Token có vẻ quá ngắn';
            status.className = 'status error';
            return false;
        }
        
        // Thêm thông tin về token
        const tokenInfo = document.createElement('div');
        tokenInfo.style.cssText = `
            font-size: 10px;
            margin-top: 5px;
            opacity: 0.7;
            color: #4CAF50;
        `;
        tokenInfo.textContent = `✓ Token hợp lệ (${token.length} ký tự)`;
        
        // Xóa info cũ nếu có
        const oldInfo = document.querySelector('.token-info');
        if (oldInfo) oldInfo.remove();
        
        tokenInfo.className = 'token-info';
        status.parentNode.appendChild(tokenInfo);
        
        return true;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            status.textContent = '✅ Đã copy token vào clipboard!';
            status.className = 'status success';
            
            setTimeout(() => {
                status.textContent = 'Click vào ô để copy lại';
                status.className = 'status';
            }, 3000);
        } catch (error) {
            console.error('Copy failed:', error);
            try {
                tokenInput.select();
                document.execCommand('copy');
                status.textContent = '✅ Đã copy (fallback)';
                status.className = 'status success';
            } catch (fallbackError) {
                status.textContent = '❌ Không thể copy. Hãy select và copy thủ công.';
                status.className = 'status error';
                tokenInput.select();
            }
        }
    }

    function loadSavedValue() {
        chrome.storage.local.get(['tokenValue', 'extractTime'], function(result) {
            if (result.tokenValue) {
                tokenInput.value = result.tokenValue;
                
                const extractTime = result.extractTime ? 
                    new Date(result.extractTime).toLocaleString() : 
                    'Không rõ';
                    
                status.innerHTML = `Token đã lưu (${extractTime})<br>Click vào ô để copy`;
                status.className = 'status';
                
                // Kiểm tra tuổi của token
                if (result.extractTime) {
                    const tokenAge = Date.now() - new Date(result.extractTime).getTime();
                    const hoursAge = Math.floor(tokenAge / (1000 * 60 * 60));
                    
                    if (hoursAge > 24) {
                        status.innerHTML += '<br><small style="color: orange;">⚠️ Token có thể đã cũ</small>';
                    }
                }
            }
        });
    }

    // Auto-refresh token mỗi 30 phút nếu đang ở trang Facebook Business
    setInterval(async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url.includes('business.facebook.com')) {
                console.log('Auto-refreshing token...');
                // Tự động extract token mới
                chrome.tabs.sendMessage(tab.id, { action: 'extractToken' })
                    .then(response => {
                        if (response && response.tokenValue && response.tokenValue !== tokenInput.value) {
                            tokenInput.value = response.tokenValue;
                            chrome.storage.local.set({ 
                                tokenValue: response.tokenValue,
                                extractTime: new Date().toISOString()
                            });
                        }
                    })
                    .catch(() => {
                        // Ignore errors trong auto-refresh
                    });
            }
        } catch (error) {
            // Ignore errors trong auto-refresh
        }
    }, 30 * 60 * 1000); // 30 phút
});