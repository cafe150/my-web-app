(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EnvDetector = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    function detectOS(nav) {
        const ua = (nav && nav.userAgent) || '';
        const platform = (nav && nav.platform) || '';
        const uadPlatform = nav && nav.userAgentData && nav.userAgentData.platform;

        let osName = 'Unknown OS';
        let bitness = '';

        const is64 = (nav && nav.userAgentData && nav.userAgentData.bitness === '64') ||
                     /x86_64|x64|Win64|WOW64|amd64/i.test(ua) ||
                     /x64|x86_64/i.test(platform);
        const is32 = (nav && nav.userAgentData && nav.userAgentData.bitness === '32') ||
                     (/i386|i686|Win32/i.test(ua) && !is64);

        if (is64) bitness = '64-bit';
        else if (is32) bitness = '32-bit';

        if (uadPlatform === 'Windows' || /Win/i.test(platform) || /Windows/i.test(ua)) {
            if (/Windows NT 10\.0/i.test(ua)) osName = 'Windows 10/11';
            else if (/Windows NT 6\.3/i.test(ua)) osName = 'Windows 8.1';
            else if (/Windows NT 6\.2/i.test(ua)) osName = 'Windows 8';
            else if (/Windows NT 6\.1/i.test(ua)) osName = 'Windows 7';
            else osName = 'Windows';
        } else if (uadPlatform === 'iOS' || /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && nav && nav.maxTouchPoints > 1)) {
            osName = 'iOS';
        } else if (uadPlatform === 'macOS' || /Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) {
            osName = 'macOS';
        } else if (uadPlatform === 'Android' || /Android/i.test(ua)) {
            osName = 'Android';
        } else if (uadPlatform === 'Linux' || /Linux/i.test(platform) || /Linux|X11/i.test(ua)) {
            osName = 'Linux';
        } else if (/CrOS/i.test(ua)) {
            osName = 'ChromeOS';
        }

        return { osName, bitness };
    }

    function parseUserAgentBrowser(ua) {
        let name = '';
        let version = '';
        let chromiumVersion = '';

        const chromiumMatch = ua.match(/Chrome\/([\d.]+)/i) || ua.match(/Chromium\/([\d.]+)/i);
        if (chromiumMatch) {
            chromiumVersion = chromiumMatch[1];
        }

        if (/Brave/i.test(ua)) {
            name = 'Brave';
            const match = ua.match(/Brave\/([\d.]+)/i);
            version = match ? match[1] : chromiumVersion;
        } else if (/Edg(?:e|A)?\/([\d.]+)/i.test(ua)) {
            name = 'Edge';
            const match = ua.match(/Edg(?:e|A)?\/([\d.]+)/i);
            version = match ? match[1] : '';
        } else if (/OPR\/([\d.]+)|Opera\/([\d.]+)/i.test(ua)) {
            name = 'Opera';
            const match = ua.match(/OPR\/([\d.]+)|Opera\/([\d.]+)/i);
            version = match ? (match[1] || match[2]) : '';
        } else if (/Vivaldi\/([\d.]+)/i.test(ua)) {
            name = 'Vivaldi';
            const match = ua.match(/Vivaldi\/([\d.]+)/i);
            version = match ? match[1] : '';
        } else if (/Firefox\/([\d.]+)|FxiOS\/([\d.]+)/i.test(ua)) {
            name = 'Firefox';
            const match = ua.match(/Firefox\/([\d.]+)|FxiOS\/([\d.]+)/i);
            version = match ? (match[1] || match[2]) : '';
        } else if (/Version\/([\d.]+).*Safari/i.test(ua) || (/Safari\/[\d.]+/i.test(ua) && !/Chrome/i.test(ua))) {
            name = 'Safari';
            const match = ua.match(/Version\/([\d.]+)/i);
            version = match ? match[1] : '';
        } else if (/Chrome\/([\d.]+)|CriOS\/([\d.]+)/i.test(ua)) {
            name = 'Chrome';
            const match = ua.match(/Chrome\/([\d.]+)|CriOS\/([\d.]+)/i);
            version = match ? (match[1] || match[2]) : '';
        }

        return { name, version, chromiumVersion };
    }

    function detectBrowserSync(nav) {
        const ua = (nav && nav.userAgent) || '';
        let parsed = parseUserAgentBrowser(ua);

        let isBrave = !!(nav && nav.brave) || parsed.name === 'Brave';
        if (isBrave) {
            parsed.name = 'Brave';
            if (!parsed.version && parsed.chromiumVersion) {
                parsed.version = parsed.chromiumVersion;
            }
        }

        if (!parsed.name && nav && nav.userAgentData && nav.userAgentData.brands) {
            const brands = nav.userAgentData.brands;
            const braveBrand = brands.find(b => /Brave/i.test(b.brand));
            const edgeBrand = brands.find(b => /Edge|Microsoft Edge/i.test(b.brand));
            const operaBrand = brands.find(b => /Opera/i.test(b.brand));
            const chromeBrand = brands.find(b => /Google Chrome|Chrome/i.test(b.brand));
            const chromiumBrand = brands.find(b => /Chromium/i.test(b.brand));

            if (braveBrand) { parsed.name = 'Brave'; parsed.version = braveBrand.version; }
            else if (edgeBrand) { parsed.name = 'Edge'; parsed.version = edgeBrand.version; }
            else if (operaBrand) { parsed.name = 'Opera'; parsed.version = operaBrand.version; }
            else if (chromeBrand) { parsed.name = 'Chrome'; parsed.version = chromeBrand.version; }
            else if (chromiumBrand) { parsed.name = 'Chromium'; parsed.version = chromiumBrand.version; }
        }

        return {
            name: parsed.name || 'Browser',
            version: parsed.version || '',
            chromiumVersion: parsed.chromiumVersion || ''
        };
    }

    function formatEnvString(browser, os) {
        let bStr = browser.name;
        if (browser.version) {
            bStr += ' ' + browser.version;
        }
        if (os.bitness) {
            bStr += ' (' + os.bitness + ')';
        }
        if (browser.chromiumVersion && browser.name !== 'Chrome' && browser.chromiumVersion !== browser.version) {
            bStr += ' Chromium: ' + browser.chromiumVersion;
        }

        return bStr + ' / ' + os.osName;
    }

    function detectEnvironment(nav) {
        const safeNav = nav || (typeof navigator !== 'undefined' ? navigator : {});
        const os = detectOS(safeNav);
        const browser = detectBrowserSync(safeNav);
        return formatEnvString(browser, os);
    }

    async function detectEnvironmentAsync(nav) {
        const safeNav = nav || (typeof navigator !== 'undefined' ? navigator : {});
        const os = detectOS(safeNav);
        let browser = detectBrowserSync(safeNav);

        if (safeNav.brave && typeof safeNav.brave.isBrave === 'function') {
            try {
                const isBrave = await safeNav.brave.isBrave();
                if (isBrave) {
                    browser.name = 'Brave';
                }
            } catch (e) {}
        }

        if (safeNav.userAgentData && typeof safeNav.userAgentData.getHighEntropyValues === 'function') {
            try {
                const hints = await safeNav.userAgentData.getHighEntropyValues([
                    'fullVersionList', 'bitness', 'architecture', 'platform', 'platformVersion', 'model'
                ]);
                if (hints) {
                    if (hints.bitness === '64') os.bitness = '64-bit';
                    else if (hints.bitness === '32') os.bitness = '32-bit';

                    if (hints.fullVersionList && Array.isArray(hints.fullVersionList)) {
                        const braveEntry = hints.fullVersionList.find(b => /Brave/i.test(b.brand));
                        const chromeEntry = hints.fullVersionList.find(b => /Google Chrome|Chrome/i.test(b.brand));
                        const edgeEntry = hints.fullVersionList.find(b => /Microsoft Edge|Edge/i.test(b.brand));
                        const operaEntry = hints.fullVersionList.find(b => /Opera/i.test(b.brand));
                        const chromiumEntry = hints.fullVersionList.find(b => /Chromium/i.test(b.brand));

                        if (braveEntry) {
                            browser.name = 'Brave';
                            browser.version = braveEntry.version;
                        } else if (edgeEntry) {
                            browser.name = 'Edge';
                            browser.version = edgeEntry.version;
                        } else if (operaEntry) {
                            browser.name = 'Opera';
                            browser.version = operaEntry.version;
                        } else if (chromeEntry) {
                            browser.name = 'Chrome';
                            browser.version = chromeEntry.version;
                        }

                        if (chromiumEntry) {
                            browser.chromiumVersion = chromiumEntry.version;
                        }
                    }
                }
            } catch (e) {}
        }

        return formatEnvString(browser, os);
    }

    return {
        detectOS,
        detectBrowserSync,
        detectEnvironment,
        detectEnvironmentAsync
    };
}));
