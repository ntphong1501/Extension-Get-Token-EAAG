// Background script để xử lý requests ngầm
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchTokenSilently') {
        fetchTokenSilently()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ 
                success: false, 
                error: error.message 
            }));
        return true; // Giữ kênh message mở cho async response
    }
});

async function fetchTokenSilently() {
    try {
        console.log('🔍 Đang fetch token ngầm...');
        
        // Các URL có thể chứa token
        const targetUrls = [
            'https://business.facebook.com/business_locations/',
            'https://business.facebook.com/',
            'https://business.facebook.com/latest/settings/business_users/',
            'https://business.facebook.com/settings/business-users',
            'https://business.facebook.com/home'
        ];
        
        for (let url of targetUrls) {
            try {
                console.log(`📡 Đang thử fetch: ${url}`);
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    credentials: 'include' // Bao gồm cookies để maintain session
                });
                
                if (!response.ok) {
                    console.log(`❌ Response không OK: ${response.status}`);
                    continue;
                }
                
                const html = await response.text();
                console.log(`✅ Nhận được HTML từ ${url}, size: ${html.length}`);
                
                // Extract token từ HTML
                const token = extractTokenFromHTML(html);
                if (token) {
                    console.log('🎉 Tìm thấy token:', token.substring(0, 50) + '...');
                    return {
                        success: true,
                        token: token,
                        source: url,
                        timestamp: new Date().toISOString()
                    };
                }
                
            } catch (fetchError) {
                console.log(`❌ Lỗi fetch ${url}:`, fetchError.message);
                continue;
            }
        }
        
        return {
            success: false,
            error: 'Không tìm thấy token trong tất cả các trang đã thử'
        };
        
    } catch (error) {
        console.error('❌ Lỗi tổng thể:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

function extractTokenFromHTML(html) {
    try {
        // Các regex patterns để tìm token - ĐÃ CẬP NHẬT cho business_locations
        const patterns = [
            // Pattern mới cho business_locations: EAAG token xuất hiện trực tiếp trong array
            /\["[^"]*","(EAAG[A-Za-z0-9_-]{100,})","[^"]*"/gi,
            /,"(EAAG[A-Za-z0-9_-]{100,})",/gi,
            /\["(EAAG[A-Za-z0-9_-]{100,})"/gi,
            
            // Patterns cũ vẫn giữ để backward compatibility
            /"apiAccessToken"\s*:\s*"(EAAG[^"]+)"/gi,
            /"accessToken"\s*:\s*"(EAAG[^"]+)"/gi,
            /apiAccessToken['"]\s*:\s*['"]EAAG([^'"]+)['"]/gi,
            /'apiAccessToken'\s*:\s*'(EAAG[^']+)'/gi,
            
            // Pattern tổng quát cho EAAG
            /EAAG[A-Za-z0-9_-]{100,}/gi
        ];
        
        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            console.log(`🔍 Đang thử pattern ${i + 1}: ${pattern.source.substring(0, 50)}...`);
            
            const matches = Array.from(html.matchAll(pattern));
            console.log(`Found ${matches.length} potential matches`);
            
            for (let match of matches) {
                let token = match[1] || match[0];
                
                // Clean token
                token = token.replace(/['",:[\]]/g, '').trim();
                console.log(`🔍 Checking token candidate: ${token.substring(0, 30)}...`);
                
                if (token.startsWith('EAAG') && token.length >= 100 && token.length <= 300) {
                    // Validate token format
                    if (/^EAAG[A-Za-z0-9_-]+$/.test(token)) {
                        console.log(`✅ Valid token found with pattern ${i + 1}: ${token.substring(0, 30)}...`);
                        return token;
                    }
                }
            }
        }
        
        console.log('❌ No valid token found in HTML');
        return null;
    } catch (error) {
        console.error('❌ Lỗi extract token:', error);
        return null;
    }
}

// Tự động fetch token định kỳ (optional)
let autoFetchInterval;

chrome.runtime.onStartup.addListener(() => {
    console.log('🚀 Background script started');
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('📦 Extension installed/updated');
});

// Hàm để bật/tắt auto-fetch
function toggleAutoFetch(enabled, intervalMinutes = 30) {
    if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        autoFetchInterval = null;
    }
    
    if (enabled) {
        autoFetchInterval = setInterval(async () => {
            console.log('⏰ Auto-fetch token...');
            const result = await fetchTokenSilently();
            
            if (result.success) {
                // Lưu token vào storage
                chrome.storage.local.set({
                    tokenValue: result.token,
                    extractTime: result.timestamp,
                    source: result.source,
                    autoFetched: true
                });
                
                console.log('✅ Auto-fetch thành công');
            }
        }, intervalMinutes * 60 * 1000);
        
        console.log(`🔄 Auto-fetch enabled (${intervalMinutes} phút)`);
    }
}