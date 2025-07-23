// Content script chạy trên business.facebook.com
(function() {
    'use strict';
    
    console.log('Facebook Token Extractor - Content script loaded');
    
    // Auto-extract Token khi trang load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoExtractToken);
    } else {
        autoExtractToken();
    }
    
    function autoExtractToken() {
        try {
            // Đợi một chút để đảm bảo page đã load hoàn toàn
            setTimeout(() => {
                const tokenValue = extractTokenValue();
                if (tokenValue) {
                    // Lưu vào storage để popup có thể access
                    chrome.storage.local.set({ 
                        tokenValue: tokenValue,
                        extractTime: new Date().toISOString(),
                        pageUrl: window.location.href
                    });
                    
                    console.log('✅ Auto-extracted Token:', tokenValue.substring(0, 50) + '...');
                    
                    // Gửi notification tới popup nếu đang mở
                    chrome.runtime.sendMessage({
                        action: 'tokenFound',
                        token: tokenValue
                    }).catch(() => {
                        // Popup không mở, bỏ qua lỗi
                    });
                }
            }, 2000);
        } catch (error) {
            console.error('❌ Auto-extract error:', error);
        }
    }
    
    function extractTokenValue() {
        try {
            console.log('🔍 Đang tìm kiếm token...');
            
            // Method 1: Tìm trong HTML source với nhiều pattern khác nhau
            const htmlSource = document.documentElement.outerHTML;
            
            // Các regex patterns để tìm token - CẬP NHẬT cho business_locations
            const tokenPatterns = [
                // Patterns mới cho business_locations page
                /\["[^"]*","(EAAG[A-Za-z0-9_-]{100,})","[^"]*"/i,
                /,"(EAAG[A-Za-z0-9_-]{100,})",/i,
                /\["(EAAG[A-Za-z0-9_-]{100,})"/i,
                
                // Patterns cũ để backward compatibility
                /"apiAccessToken"\s*:\s*"([^"]+)"/i,
                /"accessToken"\s*:\s*"([^"]+)"/i,
                /"token"\s*:\s*"(EAAG[^"]+)"/i,
                /apiAccessToken['"]\s*:\s*['"]([^'"]+)['"]/i,
                /EAAG[A-Za-z0-9_-]{100,}/g
            ];
            
            for (let pattern of tokenPatterns) {
                const match = htmlSource.match(pattern);
                if (match && match[1] && match[1].startsWith('EAAG') && match[1].length >= 100) {
                    console.log('✅ Token tìm thấy bằng pattern:', pattern);
                    return match[1];
                }
                // Trường hợp không có group capture
                if (match && match[0] && match[0].startsWith('EAAG') && match[0].length >= 100) {
                    // Clean token từ các ký tự không mong muốn
                    let cleanToken = match[0].replace(/['",:[\]]/g, '').trim();
                    if (cleanToken.startsWith('EAAG') && /^EAAG[A-Za-z0-9_-]+$/.test(cleanToken)) {
                        console.log('✅ Token tìm thấy trực tiếp:', pattern);
                        return cleanToken;
                    }
                }
            }
            
            // Method 2: Tìm trong các script tags
            console.log('🔍 Đang tìm trong script tags...');
            const scripts = document.querySelectorAll('script');
            for (let script of scripts) {
                const content = script.textContent || script.innerHTML;
                if (content.includes('apiAccessToken') || content.includes('EAAG')) {
                    for (let pattern of tokenPatterns) {
                        const match = content.match(pattern);
                        if (match && match[1] && match[1].startsWith('EAAG')) {
                            console.log('✅ Token tìm thấy trong script tag');
                            return match[1];
                        }
                        if (match && match[0] && match[0].startsWith('EAAG') && match[0].length > 100) {
                            let cleanToken = match[0].replace(/['",:[\]]/g, '').trim();
                            if (/^EAAG[A-Za-z0-9_-]+$/.test(cleanToken)) {
                                return cleanToken;
                            }
                        }
                    }
                }
            }
            
            // Method 3: Tìm trong window objects
            console.log('🔍 Đang tìm trong window objects...');
            try {
                // Tìm trong các objects phổ biến
                const commonObjects = [
                    'bizKitSettingsConfig',
                    '__INITIAL_DATA__',
                    '__SERVER_DATA__',
                    'require'
                ];
                
                for (let objName of commonObjects) {
                    if (typeof window[objName] !== 'undefined') {
                        const tokenFromObj = searchObjectForToken(window[objName]);
                        if (tokenFromObj) {
                            console.log(`✅ Token tìm thấy trong ${objName}`);
                            return tokenFromObj;
                        }
                    }
                }
                
                // Tìm trong tất cả window properties
                for (let prop in window) {
                    try {
                        if (typeof window[prop] === 'object' && window[prop] !== null) {
                            const tokenFromProp = searchObjectForToken(window[prop]);
                            if (tokenFromProp) {
                                console.log(`✅ Token tìm thấy trong window.${prop}`);
                                return tokenFromProp;
                            }
                        }
                    } catch (e) {
                        // Ignore restricted properties
                        continue;
                    }
                }
            } catch (error) {
                console.log('⚠️ Lỗi khi tìm trong window objects:', error);
            }
            
            // Method 4: Tìm trong localStorage và sessionStorage
            console.log('🔍 Đang tìm trong storage...');
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const value = localStorage.getItem(key);
                    if (value && value.includes('EAAG')) {
                        const tokenMatch = value.match(/EAAG[A-Za-z0-9_-]{100,}/);
                        if (tokenMatch) {
                            console.log('✅ Token tìm thấy trong localStorage');
                            return tokenMatch[0];
                        }
                    }
                }
                
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    const value = sessionStorage.getItem(key);
                    if (value && value.includes('EAAG')) {
                        const tokenMatch = value.match(/EAAG[A-Za-z0-9_-]{100,}/);
                        if (tokenMatch) {
                            console.log('✅ Token tìm thấy trong sessionStorage');
                            return tokenMatch[0];
                        }
                    }
                }
            } catch (error) {
                console.log('⚠️ Lỗi khi tìm trong storage:', error);
            }
            
            console.log('❌ Không tìm thấy token');
            return null;
        } catch (error) {
            console.error('❌ Error extracting token:', error);
            return null;
        }
    }
    
    function searchObjectForToken(obj, depth = 0, maxDepth = 3) {
        if (depth > maxDepth || !obj || typeof obj !== 'object') {
            return null;
        }
        
        try {
            // Tìm trực tiếp trong object
            if (obj.apiAccessToken && typeof obj.apiAccessToken === 'string' && obj.apiAccessToken.startsWith('EAAG')) {
                return obj.apiAccessToken;
            }
            
            if (obj.accessToken && typeof obj.accessToken === 'string' && obj.accessToken.startsWith('EAAG')) {
                return obj.accessToken;
            }
            
            if (obj.token && typeof obj.token === 'string' && obj.token.startsWith('EAAG')) {
                return obj.token;
            }
            
            // Tìm trong các properties
            for (let key in obj) {
                try {
                    const value = obj[key];
                    
                    // Nếu value là string và chứa EAAG
                    if (typeof value === 'string' && value.startsWith('EAAG') && value.length > 100) {
                        return value;
                    }
                    
                    // Nếu value là object, tìm đệ quy
                    if (typeof value === 'object' && value !== null) {
                        const tokenFromChild = searchObjectForToken(value, depth + 1, maxDepth);
                        if (tokenFromChild) {
                            return tokenFromChild;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Nếu object có thể stringify, tìm trong JSON string
            try {
                const jsonStr = JSON.stringify(obj);
                const tokenMatch = jsonStr.match(/EAAG[A-Za-z0-9_-]{100,}/);
                if (tokenMatch) {
                    return tokenMatch[0];
                }
            } catch (e) {
                // Ignore circular reference errors
            }
            
        } catch (error) {
            // Ignore errors
        }
        
        return null;
    }
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'extractToken') {
            console.log('📨 Popup yêu cầu extract token');
            const tokenValue = extractTokenValue();
            sendResponse({ 
                tokenValue: tokenValue,
                timestamp: new Date().toISOString(),
                pageUrl: window.location.href
            });
        }
        
        if (request.action === 'checkPage') {
            sendResponse({
                isCorrectPage: window.location.href.includes('business.facebook.com'),
                currentUrl: window.location.href
            });
        }
    });
    
    // Monitor for dynamic changes với throttling
    let extractTimeout;
    const observer = new MutationObserver((mutations) => {
        // Chỉ xử lý nếu có thay đổi quan trọng
        const hasImportantChanges = mutations.some(mutation => {
            return mutation.type === 'childList' && 
                   mutation.addedNodes.length > 0 &&
                   Array.from(mutation.addedNodes).some(node => 
                       node.nodeType === Node.ELEMENT_NODE && 
                       (node.tagName === 'SCRIPT' || 
                        (node.textContent && node.textContent.includes('EAAG')))
                   );
        });
        
        if (hasImportantChanges) {
            clearTimeout(extractTimeout);
            extractTimeout = setTimeout(() => {
                console.log('🔄 Phát hiện thay đổi DOM, đang extract lại...');
                const tokenValue = extractTokenValue();
                if (tokenValue) {
                    chrome.storage.local.set({ 
                        tokenValue: tokenValue,
                        extractTime: new Date().toISOString(),
                        pageUrl: window.location.href
                    });
                    
                    // Thông báo tới popup nếu có
                    chrome.runtime.sendMessage({
                        action: 'tokenUpdated',
                        token: tokenValue
                    }).catch(() => {});
                }
            }, 3000);
        }
    });
    
    // Start observing với options tối ưu
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }
    
    // Cleanup khi unload
    window.addEventListener('beforeunload', () => {
        observer.disconnect();
        clearTimeout(extractTimeout);
    });
    
})();