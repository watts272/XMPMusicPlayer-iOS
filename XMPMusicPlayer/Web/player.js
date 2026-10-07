'use strict';

/* ============================================================
 *  GM API 兼容层（应用版）
 * ============================================================ */
(function () {
    window.GM_addStyle = function (css) {
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    };
    window.GM_setValue = function (k, v) {
        try { window.GM.setValue(k, typeof v === 'string' ? v : JSON.stringify(v)); }
        catch (e) { console.warn('[GM] setValue', e); }
    };
    window.GM_getValue = function (k, dv) {
        return new Promise(resolve => {
            try {
                const def = (dv === null || dv === undefined) ? '' : String(dv);
                const raw = window.GM.getValue(k, def);
                resolve(raw === '' && def === '' ? null : raw);
            } catch (e) { resolve(dv === undefined ? null : dv); }
        });
    };
    window.__gmXhrCallbacks = window.__gmXhrCallbacks || {};
    window.__gmXhrCounter = window.__gmXhrCounter || 0;
    window.__gmXhrCallback = function (requestId, status, responseText) {
        const cb = window.__gmXhrCallbacks[requestId];
        if (!cb) return;
        delete window.__gmXhrCallbacks[requestId];
        try {
            if (status === 0) { cb.onerror && cb.onerror(new Error('network error')); cb.ontimeout && cb.ontimeout(); }
            else { cb.onload && cb.onload({ status, responseText, response: responseText }); if (status < 200 || status >= 400) cb.onerror && cb.onerror(new Error('HTTP ' + status)); }
        } catch (e) { console.error('[GM] xhr cb', e); }
    };
    window.GM_xmlhttpRequest = function (options) {
        const requestId = 'xhr_' + (++window.__gmXhrCounter) + '_' + Date.now();
        window.__gmXhrCallbacks[requestId] = options;
        try {
            window.GM.xmlHttpRequest(requestId, options.url, (options.method || 'GET').toUpperCase(),
                JSON.stringify(options.headers || {}), options.data || '');
        } catch (e) { delete window.__gmXhrCallbacks[requestId]; options.onerror && options.onerror(e); }
    };
})();

/* ============================================================
 *  业务代码
 * ============================================================ */
(function () {

    const EMBED_MODE = window.__EMBED_MODE === true;
    const POS_KEY = 'xny_music_player_pos_v3';
    const SETTINGS_KEY = 'xny_music_player_settings_v3';
    const PLAYLISTS_KEY = 'xny_music_player_playlists_v3';
    const STATE_KEY = 'xny_music_player_state_v3';
    const STATS_KEY = 'xny_music_player_stats_v1';
    const STATS_BASELINE_KEY = 'xny_music_player_stats_baseline_v1';
    const HOURLY_KEY = 'xny_music_player_hourly_v1';
    const HOURLY_BASELINE_KEY = 'xny_music_player_hourly_baseline_v1';
    const SYNC_KEY = 'xny_music_player_sync_v1';
    const DEVICE_ID_KEY = 'xny_music_player_device_id_v1';
    const SYNC_FILE_PLAYLISTS = 'xny_music_playlists.json';
    const SYNC_FILE_STATS = 'xny_music_stats.json';
    const SYNC_FILE_HOURLY = 'xny_music_hourly.json';
    const STATS_PLAYLIST_ID = '__stats__';

    const DEFAULT_SETTINGS = {
        collapsedSize: 56, expandedWidth: 360, expandedHeight: 600,
        playerStyle: 'default', homeMode: 'wall', theme: 'dark', colorTheme: 'ocean',
        colorGradStart: '#0A84FF', colorGradEnd: '#5AC8FA', colorAccent: '#0A84FF',
        useCustomBgColor: false, bgSolidColor: '#0a0a0c',
        navOpacity: 75, navBlur: 14, cardOpacity: 88, cardBlur: 14,
        bgImage: '', bgImageBlur: 0, bgImageDim: 45, bgImageScale: 100, bgImageX: 50, bgImageY: 50,
        baseFontSize: 14, progressHeight: 3,
        defaultVolume: 80, seekStep: 5, preferQuality: 1,
        playlistCoverSize: 56, favImportPageSize: 20,
        floatingSize: 56, floatingIcon: '',
        wallCoverSize: 88, wallScrollSpeed: 50, wallGlow: 70, wallDim: 55,
        wallStyle: 'mixed', wallBigChance: 30, wallRectHChance: 15, wallRectVChance: 15,
        wallTilt: 0, wallInertiaMs: 700,
        wallEdgeBlur: 6, wallEdgeFade: 50, wallEdgeDist: 70,
        miniSide: 'left', miniBottom: 76,
        pageFadeMs: 300, navHaptic: true,
        lyricStyle: 'scroll', /* folia removed */ lyricPickerInertiaMs: 500,
        lyricChatScale: 110,
        lyricSphereFont: 28,
        lyricHiddenStyles: [],
        jizuraUrl: '',
        jizuraBridgeUrl: '',
        jizuraEngineBase: 'jizura-engine/',
        jizuraFont: 'song',
        jizuraFontCustom: '',
        jizuraFontName: '',
        jizuraFps: 30,
        foliaMode: 'classic',
        foliaFps: 30,
        foliaEngineBase: 'folia-engine/',
        foliaWebBase: 'folia-web/',
        foliaUseOfficial: true
    };

    const SETTING_DEFS = [
        { group: '外观' },
        { key: 'playerStyle', label: '样式', type: 'select', options: [{ v: 'default', t: '简约' }, { v: 'vinyl', t: '黑胶' }] },
        { key: 'homeMode', label: '主页样式', type: 'select', options: [{ v: 'wall', t: '唱片墙' }, { v: 'carousel', t: '歌单滑动' }, { v: 'ipod', t: 'iPod' }] },
        { key: 'theme', label: '主题', type: 'select', options: [{ v: 'dark', t: '深色' }, { v: 'black', t: '默认黑' }, { v: 'light', t: '浅色' }] },
        { key: 'colorTheme', label: '主题色', type: 'colorTheme' },
        { key: 'colorGradStart', label: '渐变起始色', type: 'color' },
        { key: 'colorGradEnd', label: '渐变结束色', type: 'color' },
        { key: 'colorAccent', label: '强调色', type: 'color' },
        { key: 'useCustomBgColor', label: '自定义底图纯色', type: 'select', options: [{ v: false, t: '关闭（底图跟随渐变）' }, { v: true, t: '开启' }] },
        { key: 'bgSolidColor', label: '底图纯色', type: 'color' },
        { key: 'navOpacity', label: '导航栏透明度', type: 'range', min: 20, max: 100, step: 5, unit: '%' },
        { key: 'navBlur', label: '导航栏模糊', type: 'range', min: 0, max: 30, step: 1, unit: 'px' },
        { key: 'cardOpacity', label: '播放卡片透明度', type: 'range', min: 20, max: 100, step: 5, unit: '%' },
        { key: 'cardBlur', label: '播放卡片模糊', type: 'range', min: 0, max: 30, step: 1, unit: 'px' },
        { group: '交互动画' },
        { key: 'pageFadeMs', label: '页面淡入淡出', type: 'range', min: 150, max: 600, step: 50, unit: 'ms' },
        { key: 'navHaptic', label: '切换震动', type: 'select', options: [{ v: true, t: '开启' }, { v: false, t: '关闭' }] },
        { key: 'lyricStyle', label: '歌词样式', type: 'select', options: [
            { v: 'scroll', t: '经典滚动' },
            { v: 'chat', t: '对话框' },
            { v: 'pv-kinetic', t: '动能中央' },
            { v: 'pv-cascade', t: '级联浪潮' },
            { v: 'pv-mixed', t: '大小混排' },
            { v: 'pv-vertical', t: '竖排分镜' },
            { v: 'pv-band', t: '色带揭示' },
            { v: 'pv-noir', t: '诺尔剪辑' },
            { v: 'pv-pulse', t: '节拍脉冲' },
            { v: 'pv-sphere', t: '球形条带' }
        ]},
        { key: 'lyricPickerInertiaMs', label: '歌词样式滑动惯性', type: 'range', min: 200, max: 1200, step: 50, unit: 'ms' },
        { key: 'lyricChatScale', label: '对话框歌词放大', type: 'range', min: 100, max: 150, step: 5, unit: '%' },
        { key: 'lyricSphereFont', label: '球形条带字号', type: 'range', min: 16, max: 48, step: 1, unit: 'px' },
        { group: '唱片墙' },
        { key: 'wallStyle', label: '唱片墙样式', type: 'select', options: [
            { v: 'mixed', t: '混合尺寸（1×1 / 1×2 / 2×1 / 3×3）' },
            { v: 'uniform', t: '统一小封面（全 1×1）' },
            { v: 'classic', t: '经典错落（轻微比例变化）' }
        ]},
        { key: 'wallCoverSize', label: '封面基准大小', type: 'range', min: 56, max: 140, step: 4, unit: 'px' },
        { key: 'wallBigChance', label: '3×3 大封面概率', type: 'range', min: 0, max: 50, step: 5, unit: '%' },
        { key: 'wallRectHChance', label: '2×1 横封面概率', type: 'range', min: 0, max: 40, step: 5, unit: '%' },
        { key: 'wallRectVChance', label: '1×2 竖封面概率', type: 'range', min: 0, max: 40, step: 5, unit: '%' },
        { key: 'wallTilt', label: '视图倾角', type: 'range', min: 0, max: 15, step: 1, unit: '°' },
        { key: 'wallInertiaMs', label: '滑动惯性时长', type: 'range', min: 0, max: 1500, step: 50, unit: 'ms' },
        { key: 'wallScrollSpeed', label: '搜索滚动速度', type: 'range', min: 20, max: 100, step: 5, unit: '%' },
        { key: 'wallGlow', label: '选中发光强度', type: 'range', min: 20, max: 100, step: 5, unit: '%' },
        { key: 'wallDim', label: '未选中变暗', type: 'range', min: 20, max: 90, step: 5, unit: '%' },
        { key: 'wallEdgeBlur', label: '边缘虚化强度（0=关闭）', type: 'range', min: 0, max: 24, step: 1, unit: 'px' },
        { key: 'wallEdgeFade', label: '边缘虚化过渡（越大越柔和）', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'wallEdgeDist', label: '开始虚化处距屏幕边缘', type: 'range', min: 20, max: 200, step: 5, unit: 'px' },
        { group: '窗口' },
        { key: 'collapsedSize', label: '收起尺寸', type: 'range', min: 36, max: 96, step: 2, unit: 'px' },
        { key: 'expandedWidth', label: '展开宽度', type: 'range', min: 280, max: 520, step: 10, unit: 'px' },
        { key: 'expandedHeight', label: '展开高度', type: 'range', min: 400, max: 800, step: 10, unit: 'px' },
        { group: '文字' },
        { key: 'baseFontSize', label: '基础字号', type: 'range', min: 11, max: 18, step: 1, unit: 'px' },
        { key: 'progressHeight', label: '进度条', type: 'range', min: 2, max: 8, step: 1, unit: 'px' },
        { group: '背景图' },
        { key: 'bgImageBlur', label: '模糊', type: 'range', min: 0, max: 30, step: 1, unit: 'px' },
        { key: 'bgImageDim', label: '暗度', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'bgImageScale', label: '缩放', type: 'range', min: 100, max: 200, step: 5, unit: '%' },
        { key: 'bgImageX', label: '水平位置', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'bgImageY', label: '垂直位置', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
        { group: '播放' },
        { key: 'defaultVolume', label: '默认音量', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'seekStep', label: '快进步长', type: 'range', min: 5, max: 60, step: 5, unit: '秒' },
        { key: 'preferQuality', label: 'B站音质', type: 'select', options: [{ v: 0, t: '128K' }, { v: 1, t: '192K' }, { v: 2, t: '320K' }] },
        { group: '歌单' },
        { key: 'playlistCoverSize', label: '封面尺寸', type: 'range', min: 44, max: 88, step: 4, unit: 'px' },
        { key: 'favImportPageSize', label: '收藏夹每页', type: 'range', min: 5, max: 20, step: 5, unit: '个' },
        { group: '悬浮窗' },
        { key: 'floatingSize', label: '悬浮球大小', type: 'range', min: 36, max: 96, step: 2, unit: 'px' }
    ];


    const COLOR_THEMES = [
        { id: 'ocean',   name: '海洋蓝', accent: '#0A84FF', accentFg: '#ffffff', grad: 'linear-gradient(135deg,#0A84FF 0%,#5AC8FA 100%)' },
        { id: 'violet',  name: '紫罗兰', accent: '#BF5AF2', accentFg: '#ffffff', grad: 'linear-gradient(135deg,#7C3AED 0%,#BF5AF2 55%,#F472B6 100%)' },
        { id: 'sunset',  name: '日落橙', accent: '#FF9F0A', accentFg: '#1a1a1a', grad: 'linear-gradient(135deg,#FF453A 0%,#FF9F0A 50%,#FFD60A 100%)' },
        { id: 'mint',    name: '薄荷绿', accent: '#30D158', accentFg: '#0a1a0f', grad: 'linear-gradient(135deg,#30D158 0%,#64D2FF 100%)' },
        { id: 'rose',    name: '玫瑰红', accent: '#FF375F', accentFg: '#ffffff', grad: 'linear-gradient(135deg,#FF375F 0%,#FF9F0A 100%)' },
        { id: 'cyan',    name: '赛博青', accent: '#00C8FF', accentFg: '#001018', grad: 'linear-gradient(135deg,#00C8FF 0%,#7B61FF 100%)' },
        { id: 'gold',    name: '香槟金', accent: '#E8C47C', accentFg: '#1a1408', grad: 'linear-gradient(135deg,#B8956A 0%,#E8C47C 45%,#F5E6C8 100%)' },
        { id: 'crimson', name: '深绯红', accent: '#E11D48', accentFg: '#ffffff', grad: 'linear-gradient(135deg,#9F1239 0%,#E11D48 100%)' },
        { id: 'indigo',  name: '午夜靛', accent: '#6366F1', accentFg: '#ffffff', grad: 'linear-gradient(135deg,#312E81 0%,#6366F1 50%,#A5B4FC 100%)' },
        { id: 'mono',    name: '极简灰', accent: '#E5E5EA', accentFg: '#1c1c1e', grad: 'linear-gradient(135deg,#8E8E93 0%,#E5E5EA 100%)' },
        { id: 'peach',   name: '蜜桃粉', accent: '#FF8A80', accentFg: '#3a1010', grad: 'linear-gradient(135deg,#FF8A80 0%,#FFD3A5 100%)' },
        { id: 'forest',  name: '森林绿', accent: '#34C759', accentFg: '#ffffff', grad: 'linear-gradient(160deg,#0B3D2E 0%,#34C759 60%,#A8E6CF 100%)' },
        { id: 'solid-blue', name: '纯色蓝', accent: '#0A84FF', accentFg: '#ffffff', grad: '#0A84FF' },
        { id: 'solid-green', name: '纯色绿', accent: '#30D158', accentFg: '#0a1a0f', grad: '#30D158' },
        { id: 'solid-purple', name: '纯色紫', accent: '#BF5AF2', accentFg: '#ffffff', grad: '#BF5AF2' },
        { id: 'solid-orange', name: '纯色橙', accent: '#FF9F0A', accentFg: '#1a1a1a', grad: '#FF9F0A' }
    ];

    let fab = null, panel = null, isExpanded = false;
    let settings = { ...DEFAULT_SETTINGS };
    let playlists = [], currentPlaylistId = null, currentTrackIndex = -1;
    let loopMode = 'list';
    let audio = null, isPlaying = false, currentTrack = null;
    let pendingImageCallback = null;

    let wallItems = [];
    let wallSelectedId = null;
    let wallSelectTimer = null;
    let wallSearchQuery = '';
    let wallMatchIds = [];
    let wallMatchIdx = -1;
    let wallSearchOpen = false;
    let currentAppView = 'home';
    let wallPanX = 0, wallPanY = 0;
    let wallPlaneW = 0, wallPlaneH = 0;
    let wallDragging = false;
    let wallDragMoved = false;
    let wallVelX = 0, wallVelY = 0;
    let wallInertiaRaf = 0;
    let wallLastMoveT = 0;
    let wallSettingsDirty = false;
    let wallPtrId = null;
    let wallLastX = 0, wallLastY = 0;
    let miniBarVisible = false;
    let wallPanBound = false;
    let wallLayout = []; // {x,y,w,h,item,img}
    let wallImgMap = new Map(); // src -> HTMLImageElement
    let wallSrcCells = new Map(); // src -> [cell]，图片到达后只补画对应格子
    const wallLoadQ = [];         // 封面加载队列（按离屏幕中心距离排序）
    let wallLoadActive = 0;
    const WALL_LOAD_CONC = 16;
    let wallDrawThrottle = 0;
    let wallRaf = 0;
    let wallNeedsDraw = false;
    let wallAnimPan = null;
    let wallScale = 1;
    let wallCache = null; // 离屏整墙缓存，拖动只贴图
    let wallCacheDirty = true;
    let wallLayoutSig = '';
    let wallBakeTimer = 0;
    let wallGlowT0 = 0;
    let wallGlowRaf = 0;
    let wallPointers = new Map(); // pointerId -> {x,y}
    let wallPinchStartDist = 0;
    let wallPinchStartScale = 1;
    let wallReady = false;
    let wallLoadTotal = 0;
    let wallLoadDone = 0;
    let wallLoadGeneration = 0;
    let viewAnimLock = false;
    let playlistPageMode = 'list'; // list | detail | personal

    let stats = { tracks: {}, days: {} };
    let statsBaseline = { tracks: {}, days: {} };
    let hourly = { days: {} };
    let hourlyBaseline = { days: {} };
    let statsRange = 'all';
    let listenSession = null;
    let listenTimer = null;
    let lastStatsSave = 0;
    let lastPlayRecordId = null, lastPlayRecordTs = 0;

    let syncConfigs = [];
    let activeSyncId = '';
    let syncConfig = { enabled: false, url: '', user: '', pass: '', autoSync: false, lastSyncAt: 0, lastSyncStatus: '' };
    let deviceId = '';
    let syncing = false;
    let autoSyncTimer = null;

    const audioBlobCache = new Map();
    const MAX_BLOB_CACHE = 3;
    function cacheBlob(url, blobUrl) {
        if (audioBlobCache.size >= MAX_BLOB_CACHE) {
            const firstKey = audioBlobCache.keys().next().value;
            const old = audioBlobCache.get(firstKey);
            audioBlobCache.delete(firstKey);
            try { URL.revokeObjectURL(old); } catch (e) { }
        }
        audioBlobCache.set(url, blobUrl);
    }

    /* 封面缓存：优先 Android 磁盘缓存，其次内存 */
    const coverBlobCache = new Map();
    const coverPending = new Set();
    const MAX_COVER_CACHE = 160;
    let coverReqSeq = 0;
    const coverWaiters = {};

    const coverQueue = [];
    let coverActive = 0;
    const COVER_CONC = 3;
    function pumpCoverQueue() {
        while (coverActive < COVER_CONC && coverQueue.length) {
            const job = coverQueue.shift();
            coverActive++;
            try { job(); } catch (e) { coverActive = Math.max(0, coverActive - 1); }
        }
    }

    window.__onCoverCached = function (requestId, ok, path) {
        const w = coverWaiters[requestId];
        if (!w) return;
        delete coverWaiters[requestId];
        clearTimeout(w.timer);
        coverActive = Math.max(0, coverActive - 1);
        try { if (ok && path) coverBlobCache.set(w.src, path); } catch (e) { }
        coverPending.delete(w.src);
        pumpCoverQueue();
    };

    function resolveCoverSrc(src) {
        if (!src) return '';
        if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file:')) return src;
        if (coverBlobCache.has(src)) return coverBlobCache.get(src);
        try {
            if (window.GM && window.GM.getCachedCover) {
                const local = window.GM.getCachedCover(String(src));
                if (local) {
                    coverBlobCache.set(src, local);
                    return local;
                }
            }
        } catch (e) { }
        return src;
    }

    /* 仅返回本地缓存路径，没有缓存返回 '' */
    function cachedCoverPath(src) {
        const r = resolveCoverSrc(src);
        return (r && r !== src) ? r : '';
    }

    function prefetchCover(src) {
        if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file:')) return;
        if (coverBlobCache.has(src) || coverPending.has(src)) return;
        coverPending.add(src);
        try {
            if (window.GM && window.GM.cacheCover) {
                coverQueue.push(() => {
                    const rid = 'cv_' + (++coverReqSeq);
                    const release = () => {
                        coverPending.delete(src);
                        coverActive = Math.max(0, coverActive - 1);
                        pumpCoverQueue();
                    };
                    const timer = setTimeout(() => {
                        if (coverWaiters[rid]) { delete coverWaiters[rid]; release(); }
                    }, 20000);
                    coverWaiters[rid] = { src, timer };
                    try { window.GM.cacheCover(rid, String(src)); }
                    catch (e) { clearTimeout(timer); delete coverWaiters[rid]; release(); }
                });
                pumpCoverQueue();
                return;
            }
        } catch (e) { }
        // 无原生桥接时退回 fetch blob
        fetch(src, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
            .then(r => { if (!r.ok) throw new Error('cover'); return r.blob(); })
            .then(blob => {
                const u = URL.createObjectURL(blob);
                if (coverBlobCache.size >= MAX_COVER_CACHE) {
                    const k = coverBlobCache.keys().next().value;
                    const old = coverBlobCache.get(k);
                    coverBlobCache.delete(k);
                    try { if (old && String(old).startsWith('blob:')) URL.revokeObjectURL(old); } catch (e) { }
                }
                coverBlobCache.set(src, u);
            })
            .catch(() => { })
            .finally(() => coverPending.delete(src));
    }

    const pad = n => String(n).padStart(2, '0');
    const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const uid = p => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    /* 与屏幕刷新率同步的 rAF（唱片墙选中光效仍用原有 wallGlowRaf，不改动） */
    const xmpRaf = (typeof window !== 'undefined' && window.requestAnimationFrame)
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(() => cb(performance.now()), 16);
    const xmpCaf = (typeof window !== 'undefined' && window.cancelAnimationFrame)
        ? window.cancelAnimationFrame.bind(window)
        : clearTimeout;

    let _jizuraEngineLoading = null;
    function loadJizuraEngine() {
        if (window.XmpJizuraPlayer && window.XmpJizuraPlayer.isReady())
            return Promise.resolve(window.XmpJizuraPlayer);
        if (_jizuraEngineLoading) return _jizuraEngineLoading;
        _jizuraEngineLoading = new Promise((resolve, reject) => {
            const base = (settings && settings.jizuraEngineBase) || 'jizura-engine/';
            const loadScript = (src) => new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = src; s.async = true;
                s.onload = () => res();
                s.onerror = () => rej(new Error('加载失败: ' + src));
                document.head.appendChild(s);
            });
            const chain = window.J ? Promise.resolve() : loadScript(base + 'jizura-engine.js');
            chain.then(() => {
                if (window.XmpJizuraPlayer) return;
                return loadScript(base + 'jizura-player-adapter.js');
            }).then(() => {
                if (window.XmpJizuraPlayer && window.XmpJizuraPlayer.isReady())
                    resolve(window.XmpJizuraPlayer);
                else reject(new Error('JIZURA 引擎未就绪，请检查 assets/jizura-engine/'));
            }).catch(reject);
        }).finally(() => { _jizuraEngineLoading = null; });
        return _jizuraEngineLoading;
    }
    let _lyCoverPalette = null;
    let _lyCoverPaletteKey = '';

    function lyJizuraFontFamily() {
        const mode = settings.jizuraFont || 'song';
        if (mode === 'custom' && settings.jizuraFontName) {
            return '"' + String(settings.jizuraFontName).replace(/"/g, '') + '", "Songti SC", "STSong", SimSun, serif';
        }
        if (mode === 'hei') return '"Heiti SC","STHeiti","PingFang SC","Microsoft YaHei",sans-serif';
        if (mode === 'kai') return '"Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC",serif';
        return '"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif';
    }

    function lyRgbToHex(r, g, b) {
        const h = (n) => ('0' + Math.max(0, Math.min(255, n | 0)).toString(16)).slice(-2);
        return '#' + h(r) + h(g) + h(b);
    }
    function lyRelLuma(r, g, b) {
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    /** 从封面取 主色/强调色/前景，失败则暖灰宋体风默认 */
    function lyExtractCoverPalette(src, cb) {
        const fallback = { bg: '#1a1510', fg: '#f5f0e8', sub: '#e8dcc8', accent: '#c4a574', accent2: '#8b7355' };
        if (!src) { cb(fallback); return; }
        if (_lyCoverPaletteKey === src && _lyCoverPalette) { cb(_lyCoverPalette); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const done = (pal) => {
            _lyCoverPaletteKey = src;
            _lyCoverPalette = pal;
            cb(pal);
        };
        img.onload = () => {
            try {
                const cv = document.createElement('canvas');
                const S = 32;
                cv.width = S; cv.height = S;
                const c = cv.getContext('2d', { willReadFrequently: true });
                c.drawImage(img, 0, 0, S, S);
                const data = c.getImageData(0, 0, S, S).data;
                let buckets = {};
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 128) continue;
                    const r = data[i] >> 3 << 3, g = data[i + 1] >> 3 << 3, b = data[i + 2] >> 3 << 3;
                    const k = r + ',' + g + ',' + b;
                    buckets[k] = (buckets[k] || 0) + 1;
                }
                const sorted = Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a]);
                if (!sorted.length) { done(fallback); return; }
                const parse = (k) => k.split(',').map(Number);
                let [br, bg, bb] = parse(sorted[0]);
                // 找一颗饱和度更高的作 accent
                let accent = [br, bg, bb], bestSat = -1;
                for (let i = 0; i < Math.min(12, sorted.length); i++) {
                    const [r, g, b] = parse(sorted[i]);
                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                    const sat = max === 0 ? 0 : (max - min) / max;
                    if (sat > bestSat) { bestSat = sat; accent = [r, g, b]; }
                }
                let luma = lyRelLuma(br, bg, bb);
                // 背景略压暗，字色高对比
                const darken = (r, g, b, f) => [r * f, g * f, b * f];
                let bgc = darken(br, bg, bb, luma > 0.55 ? 0.35 : 0.55);
                let fg = luma > 0.5 ? [28, 24, 20] : [245, 240, 232];
                // 若背景仍偏亮，强制更深
                if (lyRelLuma(bgc[0], bgc[1], bgc[2]) > 0.45) bgc = darken(bgc[0], bgc[1], bgc[2], 0.5);
                const ac = accent;
                const ac2 = darken(ac[0], ac[1], ac[2], 0.75);
                done({
                    bg: lyRgbToHex(bgc[0], bgc[1], bgc[2]),
                    fg: lyRgbToHex(fg[0], fg[1], fg[2]),
                    sub: lyRgbToHex(fg[0], fg[1], fg[2]),
                    accent: lyRgbToHex(ac[0], ac[1], ac[2]),
                    accent2: lyRgbToHex(ac2[0], ac2[1], ac2[2])
                });
            } catch (e) { done(fallback); }
        };
        img.onerror = () => done(fallback);
        try {
            const resolved = (typeof resolveCoverSrc === 'function' ? resolveCoverSrc(src) : null) || src;
            img.src = resolved;
        } catch (e) { done(fallback); }
    }

    function lyJizuraThemeFromCover(cb) {
        const tr = currentTrack;
        const cover = tr && tr.cover ? ((typeof lySized === 'function' ? lySized(tr.cover, 200) : tr.cover)) : '';
        lyExtractCoverPalette(cover, (pal) => cb(pal));
    }

    function lyJizuraBakeOpts(themeOverride) {
        const dur = (audio && isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 0;
        const fallbackTheme = { bg: '#1a1510', fg: '#f5f0e8', sub: '#e8dcc8', accent: '#c4a574', accent2: '#8b7355' };
        return {
            lines: (lyLines || []).map(L => ({ t: L.t, text: L.text })),
            meta: {
                id: currentTrack && currentTrack.id,
                title: currentTrack ? (currentTrack.customTitle || currentTrack.title || '') : '',
                artist: currentTrack ? (currentTrack.artist || currentTrack.source || '') : '',
                duration: dur
            },
            theme: themeOverride || _lyCoverPalette || fallbackTheme,
            fontFamily: lyJizuraFontFamily(),
            randomize: true,
            force: false
        };
    }
    /* ---- 音频节奏分析（Web Audio）供 JIZURA 间奏动效 ---- */
    let _xmpAudioCtx = null, _xmpAnalyser = null, _xmpFreq = null, _xmpSrcNode = null;
    let _xmpBeatEnv = 0, _xmpBassSmooth = 0, _xmpEnergySmooth = 0, _xmpLastBeatT = 0;

    function xmpEnsureAnalyser() {
        if (!audio) return null;
        try {
            if (!_xmpAudioCtx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                _xmpAudioCtx = new AC();
            }
            if (_xmpAudioCtx.state === 'suspended') {
                _xmpAudioCtx.resume().catch(() => {});
            }
            if (!_xmpSrcNode) {
                // MediaElementSource 每个 audio 只能接一次
                _xmpSrcNode = _xmpAudioCtx.createMediaElementSource(audio);
                _xmpAnalyser = _xmpAudioCtx.createAnalyser();
                _xmpAnalyser.fftSize = 1024;
                _xmpAnalyser.smoothingTimeConstant = 0.72;
                _xmpFreq = new Uint8Array(_xmpAnalyser.frequencyBinCount);
                _xmpSrcNode.connect(_xmpAnalyser);
                _xmpAnalyser.connect(_xmpAudioCtx.destination);
            }
            return _xmpAnalyser;
        } catch (e) {
            console.warn('[rhythm]', e);
            return null;
        }
    }

    /** 根据频谱估能量/鼓点；并判断是否处于无歌词间奏 */
    function xmpSampleRhythm(ct) {
        const out = { energy: 0, beat: 0, bass: 0, mid: 0, instrumental: false, gap: 0 };
        const an = xmpEnsureAnalyser();
        if (an && _xmpFreq) {
            an.getByteFrequencyData(_xmpFreq);
            const n = _xmpFreq.length;
            // 低频约 60–150Hz、中频
            const bassEnd = Math.max(2, Math.floor(n * 0.08));
            const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.35));
            let bass = 0, mid = 0, all = 0;
            for (let i = 1; i < bassEnd; i++) bass += _xmpFreq[i];
            for (let i = bassEnd; i < midEnd; i++) mid += _xmpFreq[i];
            for (let i = 1; i < n; i++) all += _xmpFreq[i];
            bass = bass / ((bassEnd - 1) * 255);
            mid = mid / ((midEnd - bassEnd) * 255);
            const energy = all / ((n - 1) * 255);
            _xmpBassSmooth = _xmpBassSmooth * 0.75 + bass * 0.25;
            _xmpEnergySmooth = _xmpEnergySmooth * 0.8 + energy * 0.2;
            // 鼓点：低频突然抬升
            const spike = bass - _xmpBassSmooth * 0.85;
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            let beat = 0;
            if (spike > 0.08 && energy > 0.04 && (now - _xmpLastBeatT) > 110) {
                beat = Math.min(1, spike * 3.2);
                _xmpLastBeatT = now;
                _xmpBeatEnv = Math.max(_xmpBeatEnv, beat);
            }
            _xmpBeatEnv *= 0.88;
            out.energy = _xmpEnergySmooth;
            out.bass = _xmpBassSmooth;
            out.mid = mid;
            out.beat = Math.max(beat, _xmpBeatEnv);
        }
        // 间奏：当前无命中歌词，或距下一句仍远
        const t = ct != null ? ct : (audio ? audio.currentTime : 0);
        if (lyLines && lyLines.length) {
            const idx = lyFindIndex(lyLines, t + 0.05);
            const cur = idx >= 0 ? lyLines[idx] : null;
            const next = lyLines[idx + 1];
            const nextT = next ? next.t : (audio && isFinite(audio.duration) ? audio.duration : t + 10);
            const lineDur = next ? (next.t - (cur ? cur.t : 0)) : 4;
            // 句末 35% 或 无句 / 距下一句 > 1.2s 视为间奏空隙
            let gap = 0;
            if (idx < 0) {
                gap = next ? Math.max(0, next.t - t) : 99;
                out.instrumental = true;
            } else if (cur) {
                const elapsed = t - cur.t;
                const remain = nextT - t;
                if (remain > 1.2 && elapsed > Math.max(0.6, lineDur * 0.55)) {
                    out.instrumental = true;
                    gap = remain;
                }
                // 纯音乐：只有很少歌词行
                if (lyLines.length <= 2 && remain > 2) {
                    out.instrumental = true;
                    gap = Math.max(gap, remain);
                }
            }
            out.gap = gap;
        } else {
            out.instrumental = true;
            out.gap = 99;
        }
        return out;
    }

    function lyJizuraEnsureAndDraw(ct) {
        if (!lyEl || (settings.lyricStyle || '') !== 'jizura') return;
        const host = lyEl.querySelector('.xmp-ly-pv');
        if (!host) return;
        const JP = window.XmpJizuraPlayer;
        if (!JP || !JP.isReady()) return;
        if (!JP.getPlan() && !_lyCoverPalette) return;
        const t = (ct != null ? ct : (audio ? audio.currentTime : 0)) || 0;
        try {
            if (JP.setFps) JP.setFps(settings.jizuraFps);
            const rhythm = xmpSampleRhythm(t);
            JP.draw(host, t, { bake: lyJizuraBakeOpts, rhythm: rhythm });
        } catch (e) { console.warn('[jizura]', e); }
    }
    let _jzBootSeq = 0;
    function lyJizuraBoot() {
        if (!lyEl || (settings.lyricStyle || '') !== 'jizura') return;
        const seq = ++_jzBootSeq; // 合并连续调用：只有最后一次生效
        const alive = () => seq === _jzBootSeq && lyEl && (settings.lyricStyle || '') === 'jizura';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!alive()) return;
            lyJizuraThemeFromCover((pal) => {
                if (!alive()) return;
                loadJizuraEngine().then((JP) => {
                    if (!alive()) return;
                    const host = lyEl.querySelector('.xmp-ly-pv');
                    if (!host || !lyLines.length) return; // 歌词还没到：lyRender 之后会再 boot
                    try {
                        JP.ensurePlaying(host, audio ? (audio.currentTime || 0) : 0, { bake: lyJizuraBakeOpts(pal) });
                    } catch (e) { console.warn('[jizura] boot', e); }
                }).catch((e) => console.warn(e));
            });
        }));
    }

    /* ---- Folia：优先官方构建 iframe 嵌入，失败再退简易引擎 ---- */
    let _foliaFrame = null;
    let _foliaReady = false;
    let _foliaEngineLoading = null;
    let _foBootSeq = 0;

    function lyFoliaOfficialUrl() {
        const base = (settings.foliaWebBase || 'folia-web/').replace(/\/?$/, '/');
        const page = base + 'index.html?xmpEmbed=1';
        // Android WebView：优先 android_asset 绝对路径，避免相对路径解析失败
        try {
            const loc = String(location.href || '');
            if (loc.indexOf('android_asset') >= 0 || loc.indexOf('file:') === 0) {
                // 当前页在 assets 下时，拼出 folia-web 绝对 file URL
                const m = loc.match(/^(file:\/\/\/android_asset\/)/i)
                    || loc.match(/^(file:\/\/android_asset\/)/i)
                    || loc.match(/^(https?:\/\/[^/]+\/)/i);
                if (m && loc.indexOf('android_asset') >= 0) {
                    return 'file:///android_asset/' + base + 'index.html?xmpEmbed=1';
                }
                // 相对当前目录
                try {
                    return new URL(page, loc).href;
                } catch (e2) {}
            }
        } catch (e) {}
        return page;
    }

    function lyFoliaPost(msg) {
        try {
            if (_foliaFrame && _foliaFrame.contentWindow)
                _foliaFrame.contentWindow.postMessage(msg, '*');
        } catch (e) {}
    }

    function lyFoliaBuildSession() {
        const tr = (typeof currentTrack !== 'undefined' && currentTrack) ? currentTrack : {};
        const cover = tr.cover || null;
        return {
            type: 'xmp-folia-session',
            track: {
                name: tr.customTitle || tr.title || '',
                artist: tr.artist || tr.source || '',
                coverUrl: cover,
                id: tr.id || ''
            },
            lines: (lyLines || []).map(L => ({ t: L.t, text: L.text, tr: L.tr })),
            duration: (audio && isFinite(audio.duration)) ? audio.duration : 0,
            position: audio ? (audio.currentTime || 0) : 0,
            playing: !!(audio && !audio.paused),
            mode: settings.foliaMode || 'classic'
        };
    }

    function lyFoliaEnsureFrame() {
        if (!lyEl) return null;
        const host = lyEl.querySelector('.xmp-ly-pv');
        if (!host) return null;
        host.style.display = 'block';
        host.style.position = 'absolute';
        host.style.inset = '0';
        host.style.zIndex = '2';
        if (_foliaFrame && _foliaFrame.parentNode === host) return _foliaFrame;
        try { host.querySelectorAll('iframe.xmp-folia-frame,.xmp-folia-cv').forEach(n => n.remove()); } catch (e) {}
        const iframe = document.createElement('iframe');
        iframe.className = 'xmp-folia-frame';
        iframe.setAttribute('allow', 'autoplay');
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;z-index:3;';
        const url = lyFoliaOfficialUrl();
        console.log('[folia] load', url);
        iframe.src = url;
        host.appendChild(iframe);
        _foliaFrame = iframe;
        _foliaReady = false;
        iframe.addEventListener('load', () => {
            setTimeout(() => {
                lyFoliaPost({ type: 'xmp-folia-ping' });
                lyFoliaPost(lyFoliaBuildSession());
            }, 300);
            setTimeout(() => {
                lyFoliaPost(lyFoliaBuildSession());
            }, 1200);
        });
        iframe.addEventListener('error', () => {
            try { showToast('Folia 页面加载失败: ' + url); } catch (e) {}
        });
        return iframe;
    }

    window.addEventListener('message', (ev) => {
        const d = ev && ev.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'xmp-folia-ready' || d.type === 'xmp-folia-pong') {
            _foliaReady = true;
            lyFoliaPost(lyFoliaBuildSession());
        }
    });

    function lyFoliaBakeOpts() {
        const tr = (typeof currentTrack !== 'undefined' && currentTrack) ? currentTrack : {};
        const fallbackTheme = { bg: '#0a0a0c', fg: '#f5f0e8', accent: '#c4a574', accent2: '#8b7355', sub: '#a89f90' };
        return {
            mode: settings.foliaMode || 'classic',
            lines: (lyLines || []).map(L => ({ t: L.t, text: L.text })),
            meta: {
                title: tr.customTitle || tr.title || '',
                artist: tr.artist || tr.source || '',
                duration: (audio && isFinite(audio.duration)) ? audio.duration : 0,
                id: tr.id || ''
            },
            theme: _lyCoverPalette || fallbackTheme,
            fontFamily: (typeof lyJizuraFontFamily === 'function') ? lyJizuraFontFamily() : 'serif'
        };
    }

    function loadFoliaEngine() {
        if (window.XmpFoliaPlayer && window.XmpFoliaPlayer.isReady())
            return Promise.resolve(window.XmpFoliaPlayer);
        if (_foliaEngineLoading) return _foliaEngineLoading;
        _foliaEngineLoading = new Promise((resolve, reject) => {
            const base = (settings && settings.foliaEngineBase) || 'folia-engine/';
            const tryUrls = [base + 'folia-player-adapter.js', 'folia-player-adapter.js'];
            let i = 0;
            const tryNext = () => {
                if (i >= tryUrls.length) {
                    reject(new Error('简易 Folia 引擎也不可用'));
                    return;
                }
                const s = document.createElement('script');
                s.src = tryUrls[i++];
                s.async = true;
                s.onload = () => window.XmpFoliaPlayer ? resolve(window.XmpFoliaPlayer) : tryNext();
                s.onerror = () => tryNext();
                document.head.appendChild(s);
            };
            tryNext();
        }).finally(() => { _foliaEngineLoading = null; });
        return _foliaEngineLoading;
    }

    function lyFoliaEnsureAndDraw(ct) {
        if (!lyEl || (settings.lyricStyle || '') !== 'folia') return;
        const useOfficial = settings.foliaUseOfficial !== false;
        if (useOfficial) {
            lyFoliaEnsureFrame();
            const t = (ct != null ? ct : (audio ? audio.currentTime : 0)) || 0;
            lyFoliaPost({
                type: 'xmp-folia-clock',
                position: t,
                playing: !!(audio && !audio.paused),
                duration: (audio && isFinite(audio.duration)) ? audio.duration : 0
            });
            // 约每 2s 重推全量 session，防切歌丢词
            if (!_foliaEnsureAndDraw._lastSess || Date.now() - _foliaEnsureAndDraw._lastSess > 2000) {
                _foliaEnsureAndDraw._lastSess = Date.now();
                lyFoliaPost(lyFoliaBuildSession());
            }
            return;
        }
        // 简易引擎回退
        const host = lyEl.querySelector('.xmp-ly-pv');
        if (!host) return;
        try { host.style.display = 'block'; } catch (e) {}
        const FP = window.XmpFoliaPlayer;
        if (!FP) {
            loadFoliaEngine().then(() => lyFoliaEnsureAndDraw(ct)).catch(() => {});
            return;
        }
        const t = (ct != null ? ct : (audio ? audio.currentTime : 0)) || 0;
        try {
            if (FP.setFps) FP.setFps(settings.foliaFps || 30);
            FP.draw(host, t, { bake: lyFoliaBakeOpts, mode: settings.foliaMode || 'classic' });
        } catch (e) { console.warn('[folia]', e); }
    }

    function lyFoliaBoot() {
        if (!lyEl || (settings.lyricStyle || '') !== 'folia') return;
        const seq = ++_foBootSeq;
        const alive = () => seq === _foBootSeq && lyEl && (settings.lyricStyle || '') === 'folia';
        try {
            lyEl.classList.add('pv-mode', 'ly-jizura');
        } catch (e) {}
        if (settings.foliaUseOfficial !== false) {
            lyFoliaEnsureFrame();
            setTimeout(() => {
                if (!alive()) return;
                lyFoliaPost(lyFoliaBuildSession());
            }, 300);
            // 若 2s 仍无 ready，提示用户检查 dist
            setTimeout(() => {
                if (!alive()) return;
                if (!_foliaReady) {
                    try {
                        showToast('Folia未就绪。检查 assets/folia-web/index.html，且构建须用 base=./');
                    } catch (e) {}
                }
            }, 2500);
            return;
        }
        loadFoliaEngine().then(() => {
            if (!alive()) return;
            const host = lyEl.querySelector('.xmp-ly-pv');
            if (!host || !window.XmpFoliaPlayer) return;
            try {
                window.XmpFoliaPlayer.ensurePlaying(host, audio ? audio.currentTime : 0, {
                    bake: lyFoliaBakeOpts(), rebake: true
                });
            } catch (e) { console.warn('[folia] boot', e); }
        }).catch(e => console.warn('[folia]', e));
    }

    function lyLeaveFoliaSurface() {
        _foliaReady = false;
        try {
            if (_foliaFrame) {
                _foliaFrame.src = 'about:blank';
                if (_foliaFrame.parentNode) _foliaFrame.parentNode.removeChild(_foliaFrame);
            }
        } catch (e) {}
        _foliaFrame = null;
        try { if (window.XmpFoliaPlayer) window.XmpFoliaPlayer.dispose(); } catch (e) {}
        if (lyEl) {
            const host = lyEl.querySelector('.xmp-ly-pv');
            if (host) {
                try { host.querySelectorAll('.xmp-folia-cv,iframe.xmp-folia-frame').forEach(n => n.remove()); } catch (e) {}
            }
        }
    }

    /* ---- JIZURA 网页预览：按需加载 jizura-bridge.js ---- */
    let _jizuraBridgeLoading = null;
    function loadJizuraBridge() {
        if (window.XmpJizuraBridge) return Promise.resolve(window.XmpJizuraBridge);
        if (_jizuraBridgeLoading) return _jizuraBridgeLoading;
        _jizuraBridgeLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            // 优先设置里的路径，否则与 player.js 同目录的 jizura-bridge.js，再退回相对路径
            const custom = (settings && settings.jizuraBridgeUrl) || '';
            s.src = custom || 'jizura-bridge.js';
            s.async = true;
            s.onload = () => {
                if (window.XmpJizuraBridge) resolve(window.XmpJizuraBridge);
                else reject(new Error('XmpJizuraBridge missing'));
            };
            s.onerror = () => reject(new Error('无法加载 jizura-bridge.js，请把该文件放到与 player.js 相同目录或配置 jizuraBridgeUrl'));
            document.head.appendChild(s);
        }).finally(() => { _jizuraBridgeLoading = null; });
        return _jizuraBridgeLoading;
    }
    function openJizuraPreview() {
        const lines = (typeof lyLines !== 'undefined' && lyLines && lyLines.length) ? lyLines : [];
        if (!lines.length) {
            showToast('请先打开有歌词的歌曲');
            return;
        }
        showToast('正在打开 JIZURA（仅原文 LRC）…');
        loadJizuraBridge().then((B) => {
            // 只传原文：bridge.linesToLrc 已忽略 tr
            B.openFromPlayer({
                getLyricLines: () => (lyLines || []).map(L => ({ t: L.t, text: L.text })),
                getTrackMeta: () => ({
                    title: currentTrack ? (currentTrack.customTitle || currentTrack.title || '') : '',
                    artist: currentTrack ? (currentTrack.artist || currentTrack.source || '') : ''
                }),
                getJizuraUrl: () => {
                    const u = (settings.jizuraUrl || '').trim();
                    return u || B.ONLINE_URL;
                }
            });
        }).catch((e) => {
            console.warn(e);
            showToast(String(e.message || e));
        });
    }
    const formatTime = sec => (!sec || !isFinite(sec)) ? '00:00' : `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
    const getCurrentPlaylist = () => playlists.find(p => p.id === currentPlaylistId) || null;
    const getCurrentTracks = () => { const pl = getCurrentPlaylist(); return pl ? pl.tracks : []; };

    function formatDuration(sec) {
        sec = Math.round(sec || 0);
        if (sec < 60) return sec + ' 秒';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) return `${h} 小时 ${m} 分`;
        return `${m} 分 ${sec % 60} 秒`;
    }
    function formatShortMin(sec) {
        sec = sec || 0;
        const m = Math.round(sec / 60);
        if (m < 60) return m + ' 分';
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return h + ' 时 ' + mm + ' 分';
    }

    /* ========== 日志 ========== */
    const statusLogs = [];
    const MAX_LOGS = 100;
    let statusExpanded = false;

    function logStep(stage, message) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        statusLogs.push({ time, stage, message });
        if (statusLogs.length > MAX_LOGS) statusLogs.shift();
        updateStatusBar(stage, message);
        if (statusExpanded) renderStatusLogs();
        console.log(`[${stage}] ${message}`);
    }
    function updateStatusBar(stage, message) {
        if (!panel) return;
        const textEl = panel.querySelector('#xmp-status-text');
        const indicator = panel.querySelector('#xmp-status-indicator');
        if (!textEl) return;
        textEl.textContent = `[${stage}] ${message}`;
        if (indicator) indicator.dataset.stage = stage;
    }
    function renderStatusLogs() {
        if (!panel) return;
        const listEl = panel.querySelector('#xmp-status-log');
        if (!listEl) return;
        listEl.innerHTML = statusLogs.slice(-30).map(l =>
            `<div class="xmp-log-item"><span class="xmp-log-time">${escHtml(l.time)}</span><span class="xmp-log-stage" data-stage="${escHtml(l.stage)}">${escHtml(l.stage)}</span><span class="xmp-log-msg">${escHtml(l.message)}</span></div>`
        ).join('');
        listEl.scrollTop = listEl.scrollHeight;
    }
    function toggleStatusExpand() {
        if (!panel) return;
        statusExpanded = !statusExpanded;
        const logEl = panel.querySelector('#xmp-status-log');
        const toggleEl = panel.querySelector('#xmp-status-toggle');
        if (logEl) logEl.style.display = statusExpanded ? 'flex' : 'none';
        if (toggleEl) toggleEl.textContent = statusExpanded ? '▼' : '▲';
        if (statusExpanded) renderStatusLogs();
    }

    /* ========== 存储 ========== */
    function clampPos(l, t) {
        const s = settings.collapsedSize;
        return {
            left: Math.max(4, Math.min(Math.max(4, window.innerWidth - s - 4), l)),
            top: Math.max(4, Math.min(Math.max(4, window.innerHeight - s - 4), t))
        };
    }
    async function loadPos() {
        try { const raw = await GM_getValue(POS_KEY, null); if (raw) { const p = JSON.parse(raw); if (typeof p.left === 'number') return p; } } catch (_) { }
        return { left: window.innerWidth - settings.collapsedSize - 16, top: 20 };
    }
    const savePos = (l, t) => { try { GM_setValue(POS_KEY, JSON.stringify({ left: l, top: t })); } catch (_) { } };
    async function loadSettings() { try { const raw = await GM_getValue(SETTINGS_KEY, null); if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch (_) { settings = { ...DEFAULT_SETTINGS }; } }
    const saveSettings = () => { try { GM_setValue(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { } };

    async function loadPlaylists() {
        try { const raw = await GM_getValue(PLAYLISTS_KEY, null); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) playlists = p; } } catch (_) { }
        if (!playlists.length) playlists = [{ id: uid('pl'), name: '默认歌单', cover: '', tracks: [], createdAt: Date.now(), updatedAt: Date.now(), showOnWall: true }];
        for (const pl of playlists) {
            pl.id = pl.id || uid('pl'); pl.name = pl.name || '未命名歌单'; pl.cover = pl.cover || '';
            pl.updatedAt = pl.updatedAt || pl.createdAt || Date.now();
            if (pl.showOnWall === false || pl.showOnWall === 0 || pl.showOnWall === 'false') pl.showOnWall = false;
            else pl.showOnWall = true;
            pl.excludeFromStats = !!pl.excludeFromStats;
            if (!Array.isArray(pl.tracks)) pl.tracks = [];
            for (const t of pl.tracks) {
                t.id = t.id || uid('tk');
                if (typeof t.customTitle !== 'string') t.customTitle = '';
                if (typeof t.source !== 'string') t.source = '';
                t.updatedAt = t.updatedAt || t.addedAt || 0;
            }
        }
    }
    const savePlaylists = (opts) => {
        try { GM_setValue(PLAYLISTS_KEY, JSON.stringify(playlists)); } catch (_) { }
        // 播放时仅更新 URL 不要重建整墙，否则切歌会明显卡顿
        if (opts && opts.skipWall) return;
        try {
            const wv = panel && panel.querySelector('#xmp-view-wall');
            if (wv && wv.style.display !== 'none') renderWall({ soft: true });
        } catch (_) { }
    };

    async function loadState() {
        try {
            const raw = await GM_getValue(STATE_KEY, null);
            if (raw) {
                const s = JSON.parse(raw);
                if (typeof s.currentPlaylistId === 'string') currentPlaylistId = s.currentPlaylistId;
                if (typeof s.currentTrackIndex === 'number') currentTrackIndex = s.currentTrackIndex;
                if (s.loopMode) loopMode = s.loopMode;
            }
        } catch (_) { }
        if (currentPlaylistId !== STATS_PLAYLIST_ID && !playlists.find(p => p.id === currentPlaylistId)) {
            currentPlaylistId = playlists[0] ? playlists[0].id : null;
            currentTrackIndex = -1;
        }
    }
    const saveState = () => { try { GM_setValue(STATE_KEY, JSON.stringify({ currentPlaylistId, currentTrackIndex, loopMode })); } catch (_) { } };

    /* ========== 听歌统计 ========== */
    async function loadStats() {
        try {
            const raw = await GM_getValue(STATS_KEY, null);
            if (raw) { const s = JSON.parse(raw); if (s && typeof s === 'object') stats = { tracks: s.tracks || {}, days: s.days || {} }; }
        } catch (_) { stats = { tracks: {}, days: {} }; }
    }
    const saveStats = () => { try { GM_setValue(STATS_KEY, JSON.stringify(stats)); } catch (_) { } };

    async function loadStatsBaseline() {
        try {
            const raw = await GM_getValue(STATS_BASELINE_KEY, null);
            if (raw) { const s = JSON.parse(raw); statsBaseline = { tracks: s.tracks || {}, days: s.days || {} }; }
        } catch (_) { statsBaseline = { tracks: {}, days: {} }; }
    }
    const saveStatsBaseline = () => { try { GM_setValue(STATS_BASELINE_KEY, JSON.stringify(statsBaseline)); } catch (_) { } };
    const cloneStats = (s) => JSON.parse(JSON.stringify(s || { tracks: {}, days: {} }));

    /* ========== 时段统计 ========== */
    async function loadHourly() {
        try {
            const raw = await GM_getValue(HOURLY_KEY, null);
            if (raw) { const s = JSON.parse(raw); if (s && s.days) hourly = { days: s.days }; }
        } catch (_) { hourly = { days: {} }; }
        for (const dk in hourly.days) {
            const arr = hourly.days[dk];
            if (!Array.isArray(arr) || arr.length !== 24) {
                const fixed = new Array(24).fill(0);
                if (Array.isArray(arr)) for (let i = 0; i < Math.min(24, arr.length); i++) fixed[i] = Number(arr[i]) || 0;
                hourly.days[dk] = fixed;
            }
        }
    }
    const saveHourly = () => { try { GM_setValue(HOURLY_KEY, JSON.stringify(hourly)); } catch (_) { } };

    async function loadHourlyBaseline() {
        try {
            const raw = await GM_getValue(HOURLY_BASELINE_KEY, null);
            if (raw) { const s = JSON.parse(raw); if (s && s.days) hourlyBaseline = { days: s.days }; }
        } catch (_) { hourlyBaseline = { days: {} }; }
        for (const dk in hourlyBaseline.days) {
            const arr = hourlyBaseline.days[dk];
            if (!Array.isArray(arr) || arr.length !== 24) {
                const fixed = new Array(24).fill(0);
                if (Array.isArray(arr)) for (let i = 0; i < Math.min(24, arr.length); i++) fixed[i] = Number(arr[i]) || 0;
                hourlyBaseline.days[dk] = fixed;
            }
        }
    }
    const saveHourlyBaseline = () => { try { GM_setValue(HOURLY_BASELINE_KEY, JSON.stringify(hourlyBaseline)); } catch (_) { } };
    const cloneHourly = (h) => JSON.parse(JSON.stringify(h || { days: {} }));

    function computeHourlyDelta(current, baseline) {
        const delta = { days: {} };
        for (const dk in (current.days || {})) {
            const cur = current.days[dk] || [];
            const base = (baseline.days && baseline.days[dk]) || [];
            const d = new Array(24).fill(0);
            let has = false;
            for (let h = 0; h < 24; h++) {
                const diff = Math.max(0, (cur[h] || 0) - (base[h] || 0));
                if (diff > 0) { d[h] = diff; has = true; }
            }
            if (has) delta.days[dk] = d;
        }
        return delta;
    }

    function applyHourlyDelta(cloud, delta) {
        const out = cloneHourly(cloud);
        for (const dk in (delta.days || {})) {
            let cur = out.days[dk];
            if (!Array.isArray(cur) || cur.length !== 24) {
                const fixed = new Array(24).fill(0);
                if (Array.isArray(cur)) for (let i = 0; i < Math.min(24, cur.length); i++) fixed[i] = Number(cur[i]) || 0;
                cur = fixed;
                out.days[dk] = cur;
            }
            const d = delta.days[dk];
            for (let h = 0; h < 24; h++) cur[h] = (cur[h] || 0) + (d[h] || 0);
        }
        return out;
    }

    function addHourlyDuration(deltaSec) {
        if (!(deltaSec > 0)) return;
        const now = new Date();
        const dk = getDateKey(now.getTime());
        const h = now.getHours();
        let day = hourly.days[dk];
        if (!Array.isArray(day) || day.length !== 24) {
            const fixed = new Array(24).fill(0);
            if (Array.isArray(day)) for (let i = 0; i < Math.min(24, day.length); i++) fixed[i] = Number(day[i]) || 0;
            day = fixed;
            hourly.days[dk] = day;
        }
        day[h] = (day[h] || 0) + deltaSec;
    }

    function computeStatsDelta(current, baseline) {
        const delta = { tracks: {}, days: {} };
        for (const id in (current.tracks || {})) {
            const cur = current.tracks[id];
            const base = (baseline.tracks && baseline.tracks[id]) || { plays: 0, sec: 0 };
            const dp = Math.max(0, (cur.plays || 0) - (base.plays || 0));
            const ds = Math.max(0, (cur.sec || 0) - (base.sec || 0));
            if (dp > 0 || ds > 0) delta.tracks[id] = { plays: dp, sec: ds };
        }
        for (const dk in (current.days || {})) {
            const cur = current.days[dk];
            const base = (baseline.days && baseline.days[dk]) || { sec: 0, tracks: {} };
            const ds = Math.max(0, (cur.sec || 0) - (base.sec || 0));
            const dtracks = {};
            for (const tid in (cur.tracks || {})) {
                const ct = cur.tracks[tid];
                const bt = (base.tracks && base.tracks[tid]) || { plays: 0, sec: 0 };
                const dp = Math.max(0, (ct.plays || 0) - (bt.plays || 0));
                const dsec = Math.max(0, (ct.sec || 0) - (bt.sec || 0));
                if (dp > 0 || dsec > 0) dtracks[tid] = { plays: dp, sec: dsec };
            }
            if (ds > 0 || Object.keys(dtracks).length) delta.days[dk] = { sec: ds, tracks: dtracks };
        }
        return delta;
    }

    function applyStatsDelta(cloudBase, delta) {
        const out = cloneStats(cloudBase);
        for (const id in (delta.tracks || {})) {
            const cur = out.tracks[id] || (out.tracks[id] = { plays: 0, sec: 0 });
            cur.plays = (cur.plays || 0) + (delta.tracks[id].plays || 0);
            cur.sec = (cur.sec || 0) + (delta.tracks[id].sec || 0);
        }
        for (const dk in (delta.days || {})) {
            const cur = out.days[dk] || (out.days[dk] = { sec: 0, tracks: {} });
            const d = delta.days[dk];
            cur.sec = (cur.sec || 0) + (d.sec || 0);
            for (const tid in (d.tracks || {})) {
                const ct = cur.tracks[tid] || (cur.tracks[tid] = { plays: 0, sec: 0 });
                ct.plays = (ct.plays || 0) + (d.tracks[tid].plays || 0);
                ct.sec = (ct.sec || 0) + (d.tracks[tid].sec || 0);
            }
        }
        for (const id in out.tracks) {
            const src = (stats.tracks && stats.tracks[id]) || {};
            const t = out.tracks[id];
            if (!t.title && src.title) t.title = src.title;
            if (!t.cover && src.cover) t.cover = src.cover;
            if (!t.source && src.source) t.source = src.source;
            t.lastTs = Math.max(t.lastTs || 0, src.lastTs || 0);
        }
        return out;
    }

    function getDateKey(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function shouldSkipStats(track) {
        try {
            const pl = getCurrentPlaylist();
            if (pl && pl.excludeFromStats) return true;
            if (track && track._skipStats) return true;
            // 若曲目所属歌单均设置不计入
            if (track && track.id) {
                let inAny = false, allSkip = true;
                for (const p of playlists) {
                    if (!p.tracks || !p.tracks.some(x => x && x.id === track.id)) continue;
                    inAny = true;
                    if (!p.excludeFromStats) { allSkip = false; break; }
                }
                if (inAny && allSkip) return true;
            }
        } catch (_) {}
        return false;
    }

    function deleteTrackStats(trackId) {
        if (!trackId) return false;
        try {
            if (stats.tracks && stats.tracks[trackId]) delete stats.tracks[trackId];
            if (stats.days) {
                for (const dk of Object.keys(stats.days)) {
                    const day = stats.days[dk];
                    if (day && day.tracks && day.tracks[trackId]) delete day.tracks[trackId];
                }
            }
            if (statsBaseline && statsBaseline.tracks && statsBaseline.tracks[trackId]) {
                delete statsBaseline.tracks[trackId];
            }
            if (statsBaseline && statsBaseline.days) {
                for (const dk of Object.keys(statsBaseline.days)) {
                    const day = statsBaseline.days[dk];
                    if (day && day.tracks && day.tracks[trackId]) delete day.tracks[trackId];
                }
            }
            saveStats();
            saveStatsBaseline();
            // 触发云同步（若已开）
            try { if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); } catch (_) {}
            try { if (typeof syncAllNow === 'function') { /* optional */ } } catch (_) {}
            return true;
        } catch (e) { return false; }
    }

    function recordPlay(track) {
        if (!track || !track.id) return;
        if (shouldSkipStats(track)) return;
        const now = Date.now();
        if (lastPlayRecordId === track.id && now - lastPlayRecordTs < 2000) return;
        lastPlayRecordId = track.id; lastPlayRecordTs = now;
        const tk = stats.tracks[track.id] || (stats.tracks[track.id] = { plays: 0, sec: 0 });
        tk.plays += 1;
        tk.title = track.customTitle || track.title || '未知';
        tk.cover = track.cover || '';
        tk.source = track.source || (track.type === 'bilibili' ? 'B站' : (track.fileName || '本地文件'));
        tk.lastTs = now;
        const dk = getDateKey(now);
        const day = stats.days[dk] || (stats.days[dk] = { sec: 0, tracks: {} });
        const dt = day.tracks[track.id] || (day.tracks[track.id] = { plays: 0, sec: 0 });
        dt.plays += 1;
        saveStats();
    }

    function addListenDuration(trackId, deltaSec) {
        if (!trackId || !(deltaSec > 0)) return;
        try {
            const pl = getCurrentPlaylist();
            if (pl && pl.excludeFromStats) return;
            const tr = (pl && pl.tracks) ? pl.tracks.find(x => x && x.id === trackId) : null;
            if (shouldSkipStats(tr || { id: trackId })) return;
        } catch (_) {}
        const tk = stats.tracks[trackId] || (stats.tracks[trackId] = { plays: 0, sec: 0 });
        tk.sec += deltaSec;
        const dk = getDateKey(Date.now());
        const day = stats.days[dk] || (stats.days[dk] = { sec: 0, tracks: {} });
        day.sec += deltaSec;
        const dt = day.tracks[trackId] || (day.tracks[trackId] = { plays: 0, sec: 0 });
        dt.sec += deltaSec;
    }

    function beginListenSession(trackId) {
        if (!trackId) return;
        if (listenSession && listenSession.trackId === trackId) { listenSession.lastTick = Date.now(); return; }
        endListenSession();
        listenSession = { trackId, sec: 0, lastTick: Date.now() };
        if (!listenTimer) listenTimer = setInterval(tickListen, 1000);
    }

    function tickListen() {
        if (!listenSession) return;
        const now = Date.now();
        const delta = (now - listenSession.lastTick) / 1000;
        listenSession.lastTick = now;
        if (!isPlaying) return;
        if (delta <= 0 || delta > 5) return;
        listenSession.sec += delta;
        addListenDuration(listenSession.trackId, delta);
        addHourlyDuration(delta);
        if (now - lastStatsSave > 10000) {
            lastStatsSave = now;
            saveStats();
            saveHourly();
        }
    }

    function endListenSession() {
        if (!listenSession) return;
        listenSession = null;
        saveStats();
        saveHourly();
        scheduleAutoSync();
    }

    function getRangeStart(range) {
        const now = new Date();
        if (range === 'week') {
            const d = new Date(now); const wd = d.getDay() || 7;
            d.setDate(d.getDate() - wd + 1); d.setHours(0, 0, 0, 0);
            return d.getTime();
        }
        if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        if (range === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
        return 0;
    }

    function aggregateStats(range) {
        const startTs = getRangeStart(range);
        let totalSec = 0, totalPlays = 0;
        const trackAgg = {};
        for (const dk in stats.days) {
            const [y, m, d] = dk.split('-').map(Number);
            const dayTs = new Date(y, m - 1, d).getTime();
            if (dayTs < startTs) continue;
            const day = stats.days[dk];
            totalSec += day.sec || 0;
            const tr = day.tracks || {};
            for (const tid in tr) {
                const td = tr[tid];
                const agg = trackAgg[tid] || (trackAgg[tid] = { plays: 0, sec: 0 });
                agg.plays += td.plays || 0;
                agg.sec += td.sec || 0;
                totalPlays += td.plays || 0;
            }
        }
        return { totalSec, totalPlays, trackAgg };
    }

    function findTrackById(trackId) {
        for (const pl of playlists) {
            const idx = pl.tracks.findIndex(t => t.id === trackId);
            if (idx >= 0) return { track: pl.tracks[idx], playlist: pl, index: idx };
        }
        return null;
    }

    /* ========== 时段统计 - 数据计算 ========== */
    function getWeekDays() {
        const now = new Date();
        const wd = now.getDay() || 7;
        const days = [];
        for (let i = 0; i < wd; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - wd + 1 + i);
            days.push(getDateKey(d.getTime()));
        }
        return days;
    }

    function getRecentDays(n) {
        const days = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            days.push(getDateKey(d.getTime()));
        }
        return days;
    }

    function calcHourlyAvg() {
        const weekDays = getWeekDays();
        const sums = new Array(24).fill(0);
        let cnt = 0;
        for (const dk of weekDays) {
            const arr = hourly.days[dk];
            if (!arr || !Array.isArray(arr)) continue;
            cnt++;
            for (let h = 0; h < 24; h++) sums[h] += arr[h] || 0;
        }
        if (cnt === 0) return { data: new Array(24).fill(0), cnt: 0 };
        return { data: sums.map(s => s / cnt), cnt };
    }

    function calcDailyData() {
        const days = getRecentDays(30);
        return days.map(dk => {
            const arr = hourly.days[dk] || [];
            return { dk, label: dk.slice(5), sec: Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(b) || 0), 0) : 0 };
        });
    }

    /* ========== SVG 折线图 ========== */
    function catmullRomPath(points) {
        if (points.length < 2) return '';
        let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
        }
        return d;
    }

    function renderLineChart(svgEl, values, opts) {
        if (!svgEl) return;
        const o = opts || {};
        const color = o.color || '#0A84FF';
        const xLabels = o.xLabels || [];

        const rect = svgEl.getBoundingClientRect();
        const W = Math.max(160, Math.floor(rect.width)) || 300;
        const H = Math.max(80, Math.floor(rect.height)) || 150;
        const padTop = 14, padBottom = 22, padLeft = 12, padRight = 12;

        const innerW = W - padLeft - padRight;
        const innerH = H - padTop - padBottom;

        svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svgEl.setAttribute('preserveAspectRatio', 'none');

        let maxV = 0;
        for (const v of values) if (v > maxV) maxV = v;
        if (maxV <= 0) maxV = 1;

        const N = values.length;
        const points = values.map((v, i) => {
            const x = padLeft + (N <= 1 ? innerW / 2 : (i / (N - 1)) * innerW);
            const y = padTop + innerH - (v / maxV) * innerH;
            return { x, y, v };
        });

        const pathD = catmullRomPath(points);
        let areaD = '';
        if (points.length > 0) {
            areaD = pathD + ` L ${points[points.length - 1].x.toFixed(2)} ${(padTop + innerH).toFixed(2)} L ${points[0].x.toFixed(2)} ${(padTop + innerH).toFixed(2)} Z`;
        }

        let gridLines = '';
        for (let i = 0; i <= 3; i++) {
            const y = padTop + (innerH / 3) * i;
            gridLines += `<line x1="${padLeft}" y1="${y.toFixed(2)}" x2="${W - padRight}" y2="${y.toFixed(2)}" stroke="rgba(128,128,128,.18)" stroke-width="1" stroke-dasharray="2 4"/>`;
        }

        let xLabelsSvg = '';
        if (xLabels.length && points.length) {
            const nonEmpty = [];
            for (let i = 0; i < xLabels.length; i++) if (xLabels[i]) nonEmpty.push(i);
            const steps = Math.min(6, nonEmpty.length);
            const used = new Set();
            for (let k = 0; k < steps; k++) {
                const idx = nonEmpty[Math.round((k / Math.max(1, steps - 1)) * (nonEmpty.length - 1))];
                if (used.has(idx)) continue;
                used.add(idx);
                const p = points[idx];
                if (!p) continue;
                xLabelsSvg += `<text x="${p.x.toFixed(2)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="-apple-system,sans-serif">${xLabels[idx]}</text>`;
            }
        }

        const gradId = 'xmp-grad-' + Math.random().toString(36).slice(2, 8);

        let dots = '';
        if (points.length <= 40) {
            for (const p of points) {
                if (p.v > 0) dots += `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.2" fill="${color}" opacity="0.95"/>`;
            }
        }

        svgEl.innerHTML = `
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${gridLines}
            <path d="${areaD}" fill="url(#${gradId})" stroke="none"/>
            <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
            ${xLabelsSvg}
        `;
    }

    function renderHoursView() {
        if (!panel) return;
        const hourlyChart = panel.querySelector('#xmp-hourly-chart');
        const dailyChart = panel.querySelector('#xmp-daily-chart');
        const hourlyHint = panel.querySelector('#xmp-hourly-hint');
        const dailyHint = panel.querySelector('#xmp-daily-hint');

        const { data: hourlyAvg, cnt } = calcHourlyAvg();
        if (hourlyHint) {
            const total = hourlyAvg.reduce((a, b) => a + b, 0);
            hourlyHint.textContent = cnt > 0 ? `${cnt} 天平均 · ${formatShortMin(total)}/天` : '暂无数据';
        }
        const hourXLabels = new Array(24).fill(0).map((_, i) => {
            if (i === 0) return '0时';
            if (i === 6) return '6时';
            if (i === 12) return '12时';
            if (i === 18) return '18时';
            if (i === 23) return '23时';
            return '';
        });
        renderLineChart(hourlyChart, hourlyAvg, { color: '#0A84FF', xLabels: hourXLabels });

        const daily = calcDailyData();
        const dailySec = daily.map(d => d.sec);
        const dailyTotal = dailySec.reduce((a, b) => a + b, 0);
        if (dailyHint) dailyHint.textContent = dailyTotal > 0 ? `${formatShortMin(dailyTotal)} / 30天` : '暂无数据';
        const dailyLabels = daily.map(d => d.label);
        renderLineChart(dailyChart, dailySec, { color: '#30D158', xLabels: dailyLabels });
    }

    function openHoursView() {
        if (!panel) return;
        const view = panel.querySelector('#xmp-hours-view');
        if (!view) return;
        requestAnimationFrame(() => {
            renderHoursView();
            view.classList.add('open');
        });
    }

    function closeHoursView() {
        if (!panel) return;
        const view = panel.querySelector('#xmp-hours-view');
        if (!view) return;
        view.classList.remove('open');
        view.style.transform = '';
    }

    /* ========== 云同步 ========== */
    async function loadSyncConfig() {
        try {
            const raw = await GM_getValue(SYNC_KEY, null);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.url !== undefined) {
                    syncConfigs = [{ id: uid('sync'), name: '默认', ...parsed }];
                    activeSyncId = syncConfigs[0].id;
                } else if (Array.isArray(parsed.configs)) {
                    syncConfigs = parsed.configs;
                    activeSyncId = parsed.activeId || (syncConfigs[0] ? syncConfigs[0].id : '');
                }
            }
        } catch (_) { }
        if (!syncConfigs.length) {
            const def = { id: uid('sync'), name: '默认', enabled: false, url: '', user: '', pass: '', autoSync: false, lastSyncAt: 0, lastSyncStatus: '' };
            syncConfigs = [def]; activeSyncId = def.id; saveSyncConfig();
        }
        refreshActiveSyncConfig();
        try {
            deviceId = await GM_getValue(DEVICE_ID_KEY, '');
            if (!deviceId) { deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); GM_setValue(DEVICE_ID_KEY, deviceId); }
        } catch (_) { deviceId = 'dev_unknown'; }
    }
    function refreshActiveSyncConfig() {
        const cur = syncConfigs.find(c => c.id === activeSyncId) || syncConfigs[0];
        if (cur) { activeSyncId = cur.id; syncConfig = cur; }
    }
    function saveSyncConfig() { try { GM_setValue(SYNC_KEY, JSON.stringify({ configs: syncConfigs, activeId: activeSyncId })); } catch (_) { } }

    function basicAuthHeader(user, pass) {
        try { return 'Basic ' + btoa(user + ':' + pass); }
        catch (e) { return 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass))); }
    }

    function davRequest(method, path, body) {
        return new Promise((resolve, reject) => {
            if (!syncConfig.url || !syncConfig.user || !syncConfig.pass) { reject(new Error('云同步未配置')); return; }
            let url = syncConfig.url; if (!url.endsWith('/')) url += '/'; url += path;
            const headers = {
                'Authorization': basicAuthHeader(syncConfig.user, syncConfig.pass),
                'User-Agent': 'XNYMusicPlayer/1.0'
            };
            if (body != null) headers['Content-Type'] = 'application/json; charset=utf-8';
            GM_xmlhttpRequest({
                method: method.toUpperCase(), url, headers,
                data: body == null ? '' : body,
                timeout: 30000,
                onload: (res) => resolve(res),
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    async function cloudPullFile(filename) {
        const res = await davRequest('GET', filename);
        if (res.status === 404) return null;
        if (res.status === 401 || res.status === 403) throw new Error('账号或应用密码错误');
        if (res.status < 200 || res.status >= 300) throw new Error('拉取失败 HTTP ' + res.status);
        try { return JSON.parse(res.responseText); }
        catch (e) { throw new Error('云端数据不是合法 JSON'); }
    }

    async function cloudPushFile(filename, payload) {
        const res = await davRequest('PUT', filename, JSON.stringify(payload));
        if (res.status === 401 || res.status === 403) throw new Error('账号或应用密码错误');
        if (res.status < 200 || res.status >= 300) throw new Error('上传失败 HTTP ' + res.status);
        return true;
    }

    function buildPlaylistsPayload() {
        return { app: 'xny_music_player', type: 'playlists', version: 2, deviceId, updatedAt: Date.now(), playlists: sanitizeForExport(playlists), settings: settings, state: { loopMode } };
    }
    function buildStatsPayload() {
        return { app: 'xny_music_player', type: 'stats', version: 2, deviceId, updatedAt: Date.now(), stats: stats };
    }
    function buildHourlyPayload() {
        return { app: 'xny_music_player', type: 'hourly', version: 2, deviceId, updatedAt: Date.now(), hourly: hourly };
    }

    function normTrack(t) { return { ...t, id: t.id || uid('tk'), updatedAt: t.updatedAt || t.addedAt || 0 }; }
    function normPlaylist(pl, fallback) {
        return {
            id: pl.id || uid('pl'),
            name: pl.name || '未命名歌单',
            cover: pl.cover || '',
            tracks: Array.isArray(pl.tracks) ? pl.tracks.map(normTrack) : [],
            createdAt: pl.createdAt || fallback || Date.now(),
            updatedAt: pl.updatedAt || pl.createdAt || fallback || Date.now(),
            showOnWall: typeof pl.showOnWall === 'boolean' ? pl.showOnWall : true,
            excludeFromStats: !!pl.excludeFromStats
        };
    }
    function mergePlaylists(localList, remoteList) {
        const now = Date.now();
        const map = new Map();
        for (const pl of localList) map.set(pl.id, normPlaylist(pl, now));
        for (const pl of remoteList) {
            const p = normPlaylist(pl, now);
            const existing = map.get(p.id);
            if (!existing) { map.set(p.id, p); continue; }
            const tracksById = new Map();
            for (const t of existing.tracks) tracksById.set(t.id, t);
            for (const t of p.tracks) {
                const ex = tracksById.get(t.id);
                if (!ex || (t.updatedAt || 0) > (ex.updatedAt || 0)) tracksById.set(t.id, t);
            }
            const newer = (p.updatedAt > existing.updatedAt) ? p : existing;
            map.set(p.id, { ...newer, tracks: Array.from(tracksById.values()) });
        }
        return Array.from(map.values());
    }

    async function syncPlaylistsPart() {
        const remote = await cloudPullFile(SYNC_FILE_PLAYLISTS);
        let merged;
        if (remote && Array.isArray(remote.playlists) && remote.playlists.length) merged = mergePlaylists(playlists, remote.playlists);
        else merged = playlists;
        const mergedJson = JSON.stringify(sanitizeForExport(merged));
        const remoteJson = (remote && Array.isArray(remote.playlists)) ? JSON.stringify(sanitizeForExport(remote.playlists)) : '';
        const needPush = mergedJson !== remoteJson;
        playlists = merged;
        if (currentPlaylistId !== STATS_PLAYLIST_ID && !playlists.find(p => p.id === currentPlaylistId)) {
            currentPlaylistId = playlists[0] ? playlists[0].id : null;
            currentTrackIndex = -1;
        }
        savePlaylists();
        if (needPush) { await cloudPushFile(SYNC_FILE_PLAYLISTS, buildPlaylistsPayload()); logStep('SYNC', `歌单已上传（${playlists.length} 个）`); }
        else logStep('SYNC', '歌单无变化，跳过上传');
    }

    async function syncStatsPart() {
        const remote = await cloudPullFile(SYNC_FILE_STATS);
        const remoteStats = (remote && remote.stats) ? remote.stats : { tracks: {}, days: {} };
        const delta = computeStatsDelta(stats, statsBaseline);
        const mergedStats = applyStatsDelta(remoteStats, delta);
        stats = mergedStats;
        statsBaseline = cloneStats(mergedStats);
        saveStats(); saveStatsBaseline();
        const has = Object.keys(delta.tracks || {}).length > 0 || Object.keys(delta.days || {}).length > 0;
        if (has) {
            await cloudPushFile(SYNC_FILE_STATS, buildStatsPayload());
            const dp = Object.values(delta.tracks || {}).reduce((s, t) => s + (t.plays || 0), 0);
            logStep('SYNC', `统计已上传（增量 ${dp} 次播放）`);
        } else logStep('SYNC', '统计无增量，跳过上传');
    }

    async function syncHourlyPart() {
        const remote = await cloudPullFile(SYNC_FILE_HOURLY);
        const remoteHourly = (remote && remote.hourly) ? remote.hourly : { days: {} };
        const delta = computeHourlyDelta(hourly, hourlyBaseline);
        const merged = applyHourlyDelta(remoteHourly, delta);
        hourly = merged;
        hourlyBaseline = cloneHourly(merged);
        saveHourly(); saveHourlyBaseline();
        const has = Object.keys(delta.days || {}).length > 0;
        if (has) { await cloudPushFile(SYNC_FILE_HOURLY, buildHourlyPayload()); logStep('SYNC', '时段统计已上传'); }
        else logStep('SYNC', '时段统计无增量，跳过上传');
    }

    async function syncNow(silent) {
        if (syncing) { if (!silent) showToast('同步进行中…'); return; }
        if (!syncConfig.enabled || !syncConfig.url || !syncConfig.user || !syncConfig.pass) {
            if (!silent) showToast('请先在设置里配置云同步');
            return;
        }
        syncing = true;
        if (!silent) showToast('正在同步…');
        try {
            await syncPlaylistsPart();
            await syncStatsPart();
            await syncHourlyPart();
            syncConfig.lastSyncAt = Date.now();
            syncConfig.lastSyncStatus = '成功';
            saveSyncConfig();
            if (panel) { renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist(); renderSettingsUI(); }
            if (!silent) showToast('同步完成');
        } catch (e) {
            syncConfig.lastSyncStatus = '失败：' + e.message;
            saveSyncConfig();
            logStep('SYNC', '同步失败：' + e.message);
            if (!silent) showToast('同步失败：' + e.message);
        } finally { syncing = false; if (panel) renderSettingsUI(); }
    }

    async function syncForceUpload() {
        if (!syncConfig.enabled) { showToast('请先配置云同步'); return; }
        if (!window.confirm('将用本机数据覆盖云端？其他设备的修改会丢失')) return;
        syncing = true;
        try {
            await cloudPushFile(SYNC_FILE_PLAYLISTS, buildPlaylistsPayload());
            await cloudPushFile(SYNC_FILE_STATS, buildStatsPayload());
            await cloudPushFile(SYNC_FILE_HOURLY, buildHourlyPayload());
            statsBaseline = cloneStats(stats); saveStatsBaseline();
            hourlyBaseline = cloneHourly(hourly); saveHourlyBaseline();
            syncConfig.lastSyncAt = Date.now();
            syncConfig.lastSyncStatus = '已上传';
            saveSyncConfig();
            showToast('已上传');
            logStep('SYNC', '强制上传完成（歌单+统计+时段）');
        } catch (e) { showToast('上传失败：' + e.message); }
        finally { syncing = false; if (panel) renderSettingsUI(); }
    }

    async function syncForceDownload() {
        if (!syncConfig.enabled) { showToast('请先配置云同步'); return; }
        if (!window.confirm('将用云端数据覆盖本机？本机未同步的修改会丢失')) return;
        syncing = true;
        try {
            const remotePl = await cloudPullFile(SYNC_FILE_PLAYLISTS);
            const remoteSt = await cloudPullFile(SYNC_FILE_STATS);
            const remoteHr = await cloudPullFile(SYNC_FILE_HOURLY);
            if (remotePl && Array.isArray(remotePl.playlists) && remotePl.playlists.length) playlists = remotePl.playlists;
            if (remoteSt && remoteSt.stats) stats = { tracks: remoteSt.stats.tracks || {}, days: remoteSt.stats.days || {} };
            if (remoteHr && remoteHr.hourly) hourly = { days: remoteHr.hourly.days || {} };
            for (const dk in hourly.days) {
                const arr = hourly.days[dk];
                if (!Array.isArray(arr) || arr.length !== 24) {
                    const fixed = new Array(24).fill(0);
                    if (Array.isArray(arr)) for (let i = 0; i < Math.min(24, arr.length); i++) fixed[i] = Number(arr[i]) || 0;
                    hourly.days[dk] = fixed;
                }
            }
            statsBaseline = cloneStats(stats); saveStatsBaseline();
            hourlyBaseline = cloneHourly(hourly); saveHourlyBaseline();
            if (currentPlaylistId !== STATS_PLAYLIST_ID && !playlists.find(p => p.id === currentPlaylistId)) {
                currentPlaylistId = playlists[0] ? playlists[0].id : null;
                currentTrackIndex = -1;
            }
            savePlaylists(); saveStats(); saveHourly(); saveState();
            syncConfig.lastSyncAt = Date.now();
            syncConfig.lastSyncStatus = '已下载';
            saveSyncConfig();
            if (panel) { renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist(); renderSettingsUI(); }
            showToast('已从云端拉取');
            logStep('SYNC', '强制下载完成（歌单+统计+时段）');
        } catch (e) { showToast('下载失败：' + e.message); }
        finally { syncing = false; if (panel) renderSettingsUI(); }
    }

    function scheduleAutoSync() {
        if (!syncConfig.enabled || !syncConfig.autoSync) return;
        if (autoSyncTimer) return;
        autoSyncTimer = setTimeout(() => { autoSyncTimer = null; syncNow(true); }, 30000);
    }

    /* ========== B站 API ========== */
    function extractVideoId(url) {
        url = String(url).trim();
        let m = url.match(/BV([a-zA-Z0-9]{10})/);
        if (m) return { type: 'BV', id: 'BV' + m[1] };
        m = url.match(/av(\d+)/i);
        if (m) return { type: 'AV', id: 'av' + m[1] };
        if (/^BV[a-zA-Z0-9]{10}$/.test(url)) return { type: 'BV', id: url };
        if (/^av\d+$/i.test(url)) return { type: 'AV', id: url.toLowerCase() };
        return null;
    }

    function fetchVideoInfo(videoId) {
        return new Promise((resolve, reject) => {
            const idType = videoId.type === 'BV' ? 'bvid' : 'aid';
            const idVal = videoId.type === 'BV' ? videoId.id : videoId.id.replace(/^av/i, '');
            logStep('API', `请求视频信息 ${idVal}`);
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/web-interface/view?${idType}=${idVal}`,
                headers: { 'Referer': 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15000,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code !== 0) { reject(new Error(data.message || '获取视频信息失败')); return; }
                        const v = data.data;
                        logStep('API', `视频信息成功：${v.title}`);
                        resolve({
                            aid: v.aid, bvid: v.bvid, cid: v.cid, title: v.title, cover: v.pic, duration: v.duration,
                            owner: v.owner ? v.owner.name : '',
                            pages: (v.pages || []).map(p => ({ cid: p.cid, page: p.page, title: p.part || ('P' + p.page), duration: p.duration, cover: v.pic })),
                            season: v.ugc_season ? {
                                id: v.ugc_season.id, title: v.ugc_season.title || '未命名合集', cover: v.ugc_season.cover || '',
                                episodes: (v.ugc_season.sections || []).flatMap(sec => (sec.episodes || []).map(ep => ({
                                    aid: ep.aid, bvid: ep.bvid, cid: ep.cid, title: ep.title,
                                    cover: ep.arc ? ep.arc.pic : '', duration: ep.arc ? ep.arc.duration : 0
                                })))
                            } : null
                        });
                    } catch (e) { reject(new Error('解析视频信息失败: ' + e.message)); }
                },
                onerror: () => { logStep('ERR', '获取视频信息网络错误'); reject(new Error('网络错误')); },
                ontimeout: () => { logStep('ERR', '获取视频信息请求超时'); reject(new Error('请求超时')); }
            });
        });
    }

    function fetchAudioUrl(aid, cid) {
        return new Promise((resolve, reject) => {
            logStep('API', `请求音频流 aid=${aid} cid=${cid}`);
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&fnval=16&fnver=0&fourk=1`,
                headers: { 'Referer': 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15000,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code !== 0) { reject(new Error(data.message || '获取音频流失败')); return; }
                        if (data.data && data.data.dash && data.data.dash.audio && data.data.dash.audio.length) {
                            const audios = data.data.dash.audio;
                            const targetQn = settings.preferQuality;
                            let best = audios[0];
                            for (const a of audios) { if (a.id === targetQn) { best = a; break; } if (a.id > (best.id || 0)) best = a; }
                            if (best.id !== targetQn) { for (const a of audios) { if (a.id <= targetQn && a.id > (best.id || 0)) best = a; } }
                            resolve({ url: best.baseUrl || best.base_url, backupUrl: best.backupUrl || best.backup_url || '', quality: best.id, codec: best.codecs || '' });
                            return;
                        }
                        if (data.data && data.data.durl && data.data.durl.length) {
                            resolve({ url: data.data.durl[0].url, backupUrl: data.data.durl[0].backup_url || '', quality: data.data.quality || 0, codec: 'durl' });
                            return;
                        }
                        reject(new Error('未找到可用的音频流'));
                    } catch (e) { reject(new Error('解析音频流失败: ' + e.message)); }
                },
                onerror: () => { logStep('ERR', '获取音频流网络错误'); reject(new Error('网络错误')); },
                ontimeout: () => { logStep('ERR', '获取音频流请求超时'); reject(new Error('请求超时')); }
            });
        });
    }

    async function resolveBilibiliUrl(inputUrl) {
        const videoId = extractVideoId(inputUrl);
        if (!videoId) throw new Error('无法识别B站视频链接');
        const info = await fetchVideoInfo(videoId);
        const ai = await fetchAudioUrl(info.aid, info.cid);
        return {
            id: uid('tk'), type: 'bilibili',
            bvid: info.bvid, aid: info.aid, cid: info.cid,
            title: info.title, customTitle: '',
            source: info.owner ? `B站 · ${info.owner}` : 'B站',
            cover: info.cover, duration: info.duration, owner: info.owner,
            sourceUrl: inputUrl,
            audioUrl: ai.url, backupUrl: ai.backupUrl, audioUrlTime: Date.now(),
            quality: ai.quality, codec: ai.codec,
            addedAt: Date.now(), updatedAt: Date.now()
        };
    }

    async function refreshBilibiliAudio(track) {
        if (track.type !== 'bilibili') return track;
        const ai = await fetchAudioUrl(track.aid, track.cid);
        track.audioUrl = ai.url; track.backupUrl = ai.backupUrl;
        track.quality = ai.quality; track.audioUrlTime = Date.now();
        return track;
    }

    /* ========== 收藏夹/合集/分P导入 ========== */
    function extractFavMediaId(input) {
        const str = String(input).trim();
        if (/^\d{5,}$/.test(str)) return str;
        let m = str.match(/fid=(\d+)/); if (m) return m[1];
        m = str.match(/ml(\d+)/); if (m) return m[1];
        m = str.match(/media_id=(\d+)/); if (m) return m[1];
        return null;
    }
    function fetchFavFolderInfo(mediaId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: `https://api.bilibili.com/x/v3/fav/folder/info?media_id=${mediaId}`,
                headers: { 'Referer': 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code !== 0) { reject(new Error(data.message || '收藏夹获取失败')); return; }
                        const i = data.data;
                        resolve({ id: i.id, title: i.title, cover: i.cover || '', mediaCount: i.media_count || 0, upper: i.upper ? i.upper.name : '' });
                    } catch (e) { reject(new Error('解析收藏夹信息失败')); }
                },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }
    function fetchFavResourceList(mediaId, pn, ps) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&platform=web&order=mtime&type=0`,
                headers: { 'Referer': 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code !== 0) { reject(new Error(data.message || '获取收藏夹内容失败')); return; }
                        const d = data.data || {};
                        const medias = (d.medias || []).filter(m => m.attr !== 1);
                        resolve({
                            medias: medias.map(m => ({ bvid: m.bvid, title: m.title, cover: m.cover, duration: m.duration, upper: m.upper ? m.upper.name : '' })),
                            hasMore: d.has_more, total: d.info ? d.info.media_count : 0
                        });
                    } catch (e) { reject(new Error('解析收藏夹内容失败')); }
                },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    async function importBilibiliFav(input, onProgress) {
        const mediaId = extractFavMediaId(input);
        if (!mediaId) throw new Error('无法识别收藏夹');
        logStep('FAV', `开始导入收藏夹 ID=${mediaId}`);
        onProgress && onProgress({ stage: 'info', message: '正在获取收藏夹信息…' });
        const folder = await fetchFavFolderInfo(mediaId);
        if (folder.mediaCount === 0) throw new Error('该收藏夹为空');
        const allVideos = [];
        let pn = 1; const ps = Math.min(Number(settings.favImportPageSize) || 20, 20); let hasMore = true;
        while (hasMore && pn <= 100) {
            onProgress && onProgress({ stage: 'list', message: `获取视频列表… (${allVideos.length}/${folder.mediaCount})`, current: allVideos.length, total: folder.mediaCount });
            const page = await fetchFavResourceList(mediaId, pn, ps);
            allVideos.push(...page.medias);
            hasMore = page.hasMore; pn++;
        }
        if (!allVideos.length) throw new Error('未获取到有效视频');
        const pl = createPlaylist(`收藏夹·${folder.title}`, folder.cover || '');
        currentPlaylistId = pl.id; currentTrackIndex = -1; saveState();
        let ok = 0, fail = 0;
        for (let i = 0; i < allVideos.length; i++) {
            const v = allVideos[i];
            onProgress && onProgress({ stage: 'resolve', message: `解析音频… (${i + 1}/${allVideos.length})`, current: i + 1, total: allVideos.length, title: v.title });
            try {
                const track = await resolveBilibiliUrl(v.bvid);
                track.title = v.title; track.cover = v.cover || track.cover;
                track.source = v.upper ? `B站 · ${v.upper}` : 'B站';
                pl.tracks.push(track); ok++;
            } catch (e) {
                fail++;
                pl.tracks.push({
                    id: uid('tk'), type: 'bilibili', bvid: v.bvid, aid: 0, cid: 0,
                    title: v.title, customTitle: '', source: v.upper ? `B站 · ${v.upper}` : 'B站',
                    cover: v.cover, duration: v.duration, owner: v.upper,
                    audioUrl: '', backupUrl: '', quality: 0, codec: '',
                    addedAt: Date.now(), updatedAt: Date.now(), _needResolve: true
                });
            }
            if ((i + 1) % 5 === 0) savePlaylists();
        }
        pl.updatedAt = Date.now();
        savePlaylists(); saveState();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist();
        onProgress && onProgress({ stage: 'done', message: `导入完成：成功 ${ok}，失败 ${fail}`, success: ok, fail: fail });
        scheduleAutoSync();
        return { successCount: ok, failCount: fail, total: allVideos.length };
    }

    async function importBilibiliSeason(input, onProgress) {
        const videoId = extractVideoId(input);
        if (!videoId || videoId.type !== 'BV') throw new Error('请输入BV号或链接');
        logStep('SEASON', `开始导入合集 ${videoId.id}`);
        onProgress && onProgress({ stage: 'info', message: '正在获取合集信息…' });
        const info = await fetchVideoInfo(videoId);
        if (!info.season) throw new Error('该视频不属于任何合集');
        const season = info.season;
        const allVideos = season.episodes;
        if (!allVideos.length) throw new Error('合集内没有视频');
        onProgress && onProgress({ stage: 'list', message: `合集「${season.title}」共 ${allVideos.length} 个视频`, current: allVideos.length, total: allVideos.length });
        const pl = createPlaylist(`合集·${season.title}`, season.cover || '');
        currentPlaylistId = pl.id; currentTrackIndex = -1; saveState();
        let ok = 0, fail = 0;
        for (let i = 0; i < allVideos.length; i++) {
            const v = allVideos[i];
            onProgress && onProgress({ stage: 'resolve', message: `解析音频… (${i + 1}/${allVideos.length})`, current: i + 1, total: allVideos.length, title: v.title });
            try {
                const detail = await fetchVideoInfo({ type: 'BV', id: v.bvid });
                const ai = await fetchAudioUrl(detail.aid, detail.cid);
                if (!ai || !ai.url) throw new Error('未获取到有效音频流');
                pl.tracks.push({
                    id: uid('tk'), type: 'bilibili',
                    bvid: detail.bvid, aid: detail.aid, cid: detail.cid,
                    title: v.title || detail.title, customTitle: '',
                    source: info.owner ? `B站 · ${info.owner}` : 'B站',
                    cover: detail.cover || v.cover, duration: detail.duration || v.duration,
                    owner: info.owner,
                    sourceUrl: `https://www.bilibili.com/video/${v.bvid}`,
                    audioUrl: ai.url, backupUrl: ai.backupUrl, audioUrlTime: Date.now(),
                    quality: ai.quality, codec: ai.codec,
                    addedAt: Date.now(), updatedAt: Date.now()
                });
                ok++;
            } catch (e) {
                fail++;
                pl.tracks.push({
                    id: uid('tk'), type: 'bilibili', bvid: v.bvid, aid: 0, cid: 0,
                    title: v.title, customTitle: '',
                    source: info.owner ? `B站 · ${info.owner}` : 'B站',
                    cover: v.cover, duration: v.duration, owner: info.owner,
                    audioUrl: '', backupUrl: '', quality: 0, codec: '',
                    addedAt: Date.now(), updatedAt: Date.now(), _needResolve: true
                });
            }
            if ((i + 1) % 5 === 0) savePlaylists();
        }
        pl.updatedAt = Date.now();
        savePlaylists(); saveState();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist();
        onProgress && onProgress({ stage: 'done', message: `合集导入完成：成功 ${ok}，失败 ${fail}`, success: ok, fail: fail });
        scheduleAutoSync();
        return { successCount: ok, failCount: fail, total: allVideos.length };
    }

    async function importBilibiliParts(input, onProgress) {
        const videoId = extractVideoId(input);
        if (!videoId || videoId.type !== 'BV') throw new Error('请输入BV号或链接');
        logStep('PARTS', `开始导入分P ${videoId.id}`);
        onProgress && onProgress({ stage: 'info', message: '正在获取视频信息…' });
        const info = await fetchVideoInfo(videoId);
        const pages = info.pages || [];
        if (pages.length <= 1) throw new Error('该视频只有一个分P');
        onProgress && onProgress({ stage: 'list', message: `共 ${pages.length} 个分P`, current: pages.length, total: pages.length });
        const pl = createPlaylist(`分P·${info.title}`, info.cover || '');
        currentPlaylistId = pl.id; currentTrackIndex = -1; saveState();
        let ok = 0, fail = 0;
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            const fullTitle = `P${p.page} ${p.title}`;
            onProgress && onProgress({ stage: 'resolve', message: `解析音频… (${i + 1}/${pages.length})`, current: i + 1, total: pages.length, title: fullTitle });
            try {
                const ai = await fetchAudioUrl(info.aid, p.cid);
                if (!ai || !ai.url) throw new Error('未获取到有效音频流');
                pl.tracks.push({
                    id: uid('tk'), type: 'bilibili',
                    bvid: info.bvid, aid: info.aid, cid: p.cid,
                    title: fullTitle, customTitle: '',
                    source: info.owner ? `B站 · ${info.owner}` : 'B站',
                    cover: info.cover, duration: p.duration, owner: info.owner,
                    sourceUrl: `https://www.bilibili.com/video/${info.bvid}?p=${p.page}`,
                    audioUrl: ai.url, backupUrl: ai.backupUrl, audioUrlTime: Date.now(),
                    quality: ai.quality, codec: ai.codec,
                    addedAt: Date.now(), updatedAt: Date.now()
                });
                ok++;
            } catch (e) {
                fail++;
                pl.tracks.push({
                    id: uid('tk'), type: 'bilibili', bvid: info.bvid, aid: info.aid, cid: p.cid,
                    title: fullTitle, customTitle: '',
                    source: info.owner ? `B站 · ${info.owner}` : 'B站',
                    cover: info.cover, duration: p.duration, owner: info.owner,
                    audioUrl: '', backupUrl: '', quality: 0, codec: '',
                    addedAt: Date.now(), updatedAt: Date.now(), _needResolve: true
                });
            }
            if ((i + 1) % 5 === 0) savePlaylists();
        }
        pl.updatedAt = Date.now();
        savePlaylists(); saveState();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist();
        onProgress && onProgress({ stage: 'done', message: `分P导入完成：成功 ${ok}，失败 ${fail}`, success: ok, fail: fail });
        scheduleAutoSync();
        return { successCount: ok, failCount: fail, total: pages.length };
    }

    /* ========== 播放器 ========== */
    function initAudio() {
        // 节奏分析在首次 JIZURA 绘制时惰性创建；播放时尝试 resume

        if (audio) return;
        audio = new Audio();
        audio.preload = 'metadata';
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onTrackEnded);
        audio.addEventListener('error', onAudioError);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('canplay', () => { logStep('AUDIO', 'canplay：可以开始播放'); });
        audio.addEventListener('waiting', () => { logStep('AUDIO', 'waiting：缓冲中'); });
        audio.addEventListener('play', () => {
            try {
                if (_xmpAudioCtx && _xmpAudioCtx.state === 'suspended') _xmpAudioCtx.resume();
                else xmpEnsureAnalyser();
            } catch (e) {}
        });
        audio.addEventListener('stalled', () => { logStep('AUDIO', 'stalled：加载停滞'); });
        audio.addEventListener('play', () => {
            isPlaying = true;
            if (currentTrack) beginListenSession(currentTrack.id);
            logStep('AUDIO', `开始播放：${currentTrack ? (currentTrack.customTitle || currentTrack.title) : '未知'}`);
            updatePlayButton(); updateFabIcon(); renderPlaylist(); updateVinylSpin(true); notifyNativePlayState();
        });
        audio.addEventListener('pause', () => {
            isPlaying = false;
            logStep('AUDIO', '暂停');
            updatePlayButton(); updateFabIcon(); renderPlaylist(); updateVinylSpin(false); notifyNativePlayState();
            endListenSession();
        });
    }

    function notifyNativePlayState() {
        if (window.GM && window.GM.onPlayStateChanged) {
            const title = currentTrack ? (currentTrack.customTitle || currentTrack.title || '未知歌曲') : '未在播放';
            try { window.GM.onPlayStateChanged(title, !!isPlaying, loopMode || 'list'); } catch (e) { }
        }
    }

    function onTimeUpdate() {
        if (!audio || !panel) return;
        const p = panel.querySelector('#xmp-progress-inner');
        const t = panel.querySelector('#xmp-time');
        if (p && audio.duration) p.style.width = (audio.currentTime / audio.duration) * 100 + '%';
        if (t) t.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    }
    function onLoadedMetadata() {
        const t = panel ? panel.querySelector('#xmp-time') : null;
        if (t) t.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
        logStep('AUDIO', `元数据加载完成，时长 ${formatTime(audio.duration)}`);
    }

    function onAudioError() {
        if (!audio || !audio.src) return;
        const err = audio.error;
        logStep('ERR', `音频错误：code=${err ? err.code : '?'}`);
        if (audio.__backupUrl && !audio.__triedBackup && audio.__backupUrl !== audio.src) {
            audio.__triedBackup = true;
            logStep('AUDIO', '尝试备用 URL');
            audio.src = audio.__backupUrl;
            audio.play().catch(() => { });
            return;
        }
        showToast('音频加载失败，请点击「刷新」重试');
    }

    function onTrackEnded() {
        logStep('AUDIO', '播放结束');
        // 单曲循环 / 列表切下一首时都计一次完整播放（后台循环同样计入）
        if (loopMode === 'single') {
            if (currentTrack) { try { recordPlay(currentTrack); } catch (_) {} }
            audio.currentTime = 0;
            audio.play().catch(() => { });
            return;
        }
        playNext();
    }

    /* ========== 网易云音乐 ========== */
    function extractNeteasePlaylistId(input) {
        const s = String(input || '').trim();
        if (!s) return '';
        if (/^\d{1,20}$/.test(s)) return s;
        // 支持标准链接、分享短链、带 hash 的路径等
        const m = s.match(/[?&#]id=(\d{1,20})(?:[&#]|$)/i)
            || s.match(/\/playlist(?:\/|#\/playlist\?id=)(\d{1,20})/i)
            || s.match(/playlist[\/=](\d{1,20})/i)
            || s.match(/(?:^|[^\d])(\d{6,20})(?:[^\d]|$)/);
        return m ? m[1] : '';
    }

    let ncmPlaylistWaiter = null;
    const ncmAudioWaiters = {};

    window.__onNeteasePlaylistResult = function (jsonText) {
        try {
            const result = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
            if (!ncmPlaylistWaiter) return;
            const resolve = ncmPlaylistWaiter.resolve;
            ncmPlaylistWaiter = null;
            resolve(result);
        } catch (e) {
            if (!ncmPlaylistWaiter) return;
            const reject = ncmPlaylistWaiter.reject;
            ncmPlaylistWaiter = null;
            reject(e);
        }
    };

    window.__onNeteaseAudioResult = function (jsonText) {
        try {
            const result = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
            const id = String(result && result.songId || '');
            const waiter = ncmAudioWaiters[id];
            if (!waiter) return;
            delete ncmAudioWaiters[id];
            if (result && result.ok && result.url) {
                waiter.resolve(result);
                waiter.waiters.forEach(x => x.resolve(result));
            } else {
                const err = new Error((result && result.message) || '网易云没有返回可播放地址');
                waiter.reject(err);
                waiter.waiters.forEach(x => x.reject(err));
            }
        } catch (e) { console.error('[NCM] audio callback', e); }
    };


    window.__onNeteaseSearchResult = function (jsonText) {
        try {
            const data = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
            if (window.__ncmSearchResolve) {
                window.__ncmSearchResolve(data);
                window.__ncmSearchResolve = null;
            }
        } catch (e) {
            if (window.__ncmSearchResolve) {
                window.__ncmSearchResolve({ ok: false, message: String(e) });
                window.__ncmSearchResolve = null;
            }
        }
    };

    function ncmSearchSongs(keyword, limit) {
        return new Promise((resolve) => {
            if (!window.NetEase || !window.NetEase.searchSongs) {
                resolve({ ok: false, message: '请更新 App：MainActivity 需提供 NetEase.searchSongs' });
                return;
            }
            window.__ncmSearchResolve = resolve;
            try {
                window.NetEase.searchSongs(String(keyword || ''), Number(limit) || 30);
            } catch (e) {
                window.__ncmSearchResolve = null;
                resolve({ ok: false, message: String(e && e.message || e) });
            }
            setTimeout(() => {
                if (window.__ncmSearchResolve === resolve) {
                    window.__ncmSearchResolve = null;
                    resolve({ ok: false, message: '搜索超时' });
                }
            }, 20000);
        });
    }

    function ncmGetPlaylist(playlistId) {
        return new Promise((resolve, reject) => {
            if (!window.NetEase || !window.NetEase.getPlaylist) {
                reject(new Error('Android 网易云桥接不可用')); return;
            }
            if (ncmPlaylistWaiter) {
                reject(new Error('已有网易云歌单正在解析，请稍候')); return;
            }
            ncmPlaylistWaiter = { resolve, reject };
            try { window.NetEase.getPlaylist(String(playlistId)); }
            catch (e) { ncmPlaylistWaiter = null; reject(e); return; }
            setTimeout(() => {
                if (ncmPlaylistWaiter && ncmPlaylistWaiter.resolve === resolve) {
                    ncmPlaylistWaiter = null;
                    reject(new Error('网易云歌单解析超时'));
                }
            }, 45000);
        });
    }

    function ncmGetAudioUrl(songId) {
        const id = String(songId);
        return new Promise((resolve, reject) => {
            if (!window.NetEase || !window.NetEase.getAudioUrl) {
                reject(new Error('Android 网易云桥接不可用')); return;
            }
            if (ncmAudioWaiters[id]) {
                ncmAudioWaiters[id].waiters.push({ resolve, reject }); return;
            }
            ncmAudioWaiters[id] = { resolve, reject, waiters: [] };
            try { window.NetEase.getAudioUrl(id); }
            catch (e) { delete ncmAudioWaiters[id]; reject(e); return; }
            setTimeout(() => {
                const w = ncmAudioWaiters[id];
                if (!w) return;
                delete ncmAudioWaiters[id];
                const err = new Error('获取网易云播放地址超时');
                w.reject(err);
                w.waiters.forEach(x => x.reject(err));
            }, 30000);
        });
    }

    function makeNeteaseTrack(item) {
        const artist = item.artist || '未知歌手';
        return {
            id: uid('ncm'), type: 'netease', neteaseId: String(item.id),
            title: item.title || '未知歌曲', customTitle: '',
            source: `网易云音乐 · ${artist}`,
            sourceUrl: item.sourceUrl || `https://music.163.com/song?id=${item.id}`,
            cover: item.cover || '', artist, album: item.album || '',
            duration: Number(item.duration) || 0, fee: Number(item.fee) || 0,
            audioUrl: '', audioUrlTime: 0, addedAt: Date.now(), updatedAt: Date.now()
        };
    }

    async function importNeteasePlaylist(input) {
        const playlistId = extractNeteasePlaylistId(input);
        if (!playlistId) throw new Error('无法识别网易云歌单 ID');
        logStep('IN', `网易云歌单：${playlistId}`);
        const result = await ncmGetPlaylist(playlistId);
        if (!result || !result.ok) throw new Error(result && result.message || '歌单解析失败');
        const items = Array.isArray(result.tracks) ? result.tracks : [];
        if (!items.length) throw new Error('歌单没有可导入的歌曲');

        // 导入时始终新建歌单，名称取网易云歌单名
        const baseName = String(result.name || '网易云歌单').trim() || '网易云歌单';
        let name = baseName.slice(0, 30);
        const existingNames = new Set(playlists.map(p => p.name));
        if (existingNames.has(name)) {
            let n = 2;
            while (existingNames.has(`${baseName.slice(0, 26)} (${n})`)) n++;
            name = `${baseName.slice(0, 26)} (${n})`;
        }
        const pl = {
            id: uid('pl'),
            name,
            cover: result.cover || '',
            tracks: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            showOnWall: true
        };
        for (const item of items) {
            pl.tracks.push(makeNeteaseTrack(item));
        }
        playlists.push(pl);
        currentPlaylistId = pl.id;
        currentTrackIndex = -1;
        savePlaylists(); saveState();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist(); scheduleAutoSync();
        showToast(`已新建歌单「${pl.name}」并导入 ${pl.tracks.length} 首`);
        logStep('IN', `网易云导入完成：新建「${pl.name}」${pl.tracks.length} 首`);
    }

    function ncmGetLoginStatus() {
        try {
            if (!window.NetEase || !window.NetEase.getLoginStatus) return { loggedIn: false };
            const raw = window.NetEase.getLoginStatus();
            return typeof raw === 'string' ? JSON.parse(raw) : (raw || { loggedIn: false });
        } catch (e) { return { loggedIn: false }; }
    }

    function ncmOpenLogin() {
        if (!window.NetEase || !window.NetEase.openLogin) {
            showToast('当前环境不支持网易云登录');
            return;
        }
        showToast('请在打开的页面中登录网易云账号，完成后点返回');
        try { window.NetEase.openLogin(); } catch (e) { showToast('打开登录页失败'); }
    }

    function refreshNcmLoginUI() {
        if (!panel) return;
        const statusEl = panel.querySelector('#xmp-ncm-login-status');
        if (!statusEl) return;
        const st = ncmGetLoginStatus();
        if (st.loggedIn) {
            statusEl.innerHTML = '<span style="color:#30D158;">已登录网易云</span>（VIP 权益随账号生效）';
        } else {
            statusEl.innerHTML = '<span style="color:#f87171;">未登录</span> — 未登录时 VIP 曲可能只有试听';
        }
    }

    async function playTrack(track, startPlaying = true) {
        if (!audio) initAudio();
        if (!track) return;
        miniBarVisible = true;
        try { updateMiniBar(); } catch (_) {}
        try {
            if (track.type === 'netease' && !track.audioUrl) {
                logStep('PLAY', `获取网易云播放地址：${track.title || '未知歌曲'}`);
                try {
                    const ar = await ncmGetAudioUrl(track.neteaseId);
                    track.audioUrl = ar.url; track.audioUrlTime = Date.now();
                    track.quality = ar.br || 0; savePlaylists({ skipWall: true });
                } catch (e) {
                    logStep('ERR', `网易云播放地址不可用：${e.message}`);
                    const st = ncmGetLoginStatus();
                    if (!st.loggedIn) {
                        showToast('未登录网易云：请到「添加」页登录后再播放 VIP 歌曲');
                    } else {
                        showToast(e.message || '该曲当前无法完整播放（版权/地区或账号权益不覆盖）');
                    }
                    return;
                }
            }

            if (track.type === 'bilibili' && track._needResolve && !track.audioUrl) {
                logStep('PLAY', `补解析：${track.title}`);
                try {
                    if (!track.aid || !track.cid) {
                        const info = await fetchVideoInfo({ type: 'BV', id: track.bvid });
                        track.aid = info.aid; track.cid = info.cid;
                    }
                    const ai = await fetchAudioUrl(track.aid, track.cid);
                    track.audioUrl = ai.url; track.backupUrl = ai.backupUrl;
                    track.quality = ai.quality; track.audioUrlTime = Date.now();
                    track._needResolve = false;
                    savePlaylists({ skipWall: true });
                } catch (e) { logStep('ERR', `补解析失败：${e.message}`); }
            }
            const URL_TTL = 20 * 60 * 1000;
            const isExpired = (track.type === 'bilibili' || track.type === 'netease')
                && track.audioUrl
                && (!track.audioUrlTime || (Date.now() - track.audioUrlTime) > URL_TTL);
            if (isExpired) {
                logStep('PLAY', '检测到音频 URL 可能已过期，自动刷新');
                try {
                    if (track.type === 'netease') {
                        const ar = await ncmGetAudioUrl(track.neteaseId);
                        track.audioUrl = ar.url; track.audioUrlTime = Date.now();
                        track.quality = ar.br || 0; savePlaylists({ skipWall: true });
                    } else {
                    if (!track.aid || !track.cid) {
                        const info = await fetchVideoInfo({ type: 'BV', id: track.bvid });
                        track.aid = info.aid; track.cid = info.cid;
                    }
                    const ai = await fetchAudioUrl(track.aid, track.cid);
                    track.audioUrl = ai.url; track.backupUrl = ai.backupUrl;
                    track.quality = ai.quality; track.audioUrlTime = Date.now();
                    savePlaylists();
                    }
                } catch (e) { logStep('ERR', `自动刷新失败：${e.message}`); }
            }
            audio.__backupUrl = track.backupUrl || '';
            audio.__triedBackup = false;

            const title = track.customTitle || track.title || '未知';
            if (track.type === 'bilibili' && track.audioUrl) {
                logStep('PLAY', `加载音频 URL：${title}`);
                audio.src = track.audioUrl;
            } else if (track.type === 'local' && track.fileUrl) {
                logStep('PLAY', `加载本地文件：${track.fileName || title}`);
                audio.src = track.fileUrl;
            } else if (track.audioUrl) {
                logStep('PLAY', `加载音频 URL：${title}`);
                audio.src = track.audioUrl;
            } else {
                logStep('ERR', '该歌曲没有可用的音频链接');
                showToast('该歌曲没有可用的音频链接');
                return;
            }
            audio.volume = settings.defaultVolume / 100;
            if (!currentTrack || currentTrack.id !== track.id) endListenSession();
            currentTrack = track;
            if (settings.playerStyle === 'vinyl') {
                const arm = panel ? panel.querySelector('#xmp-vinyl-arm') : null;
                if (arm) { arm.classList.remove('playing'); setTimeout(() => { if (isPlaying) arm.classList.add('playing'); }, 180); }
            }
            if (startPlaying) {
                try {
                    await audio.play();
                    recordPlay(track);
                    beginListenSession(track.id);
                } catch (err) {
                    logStep('ERR', `play() 被拒绝：${err.name}`);
                    if (err.name === 'NotAllowedError') showToast('请点击播放按钮开始播放');
                }
            }
            updateNowPlayingUI(); updateFabIcon(); notifyNativePlayState();
        } catch (err) {
            logStep('ERR', `播放异常：${err.message}`);
            showToast(`播放失败: ${err.message}`);
        }
    }

    function togglePlay() {
        const tracks = getCurrentTracks();
        if (!audio) { if (tracks.length) { currentTrackIndex = 0; playTrack(tracks[0]); } return; }
        if (!audio.src && tracks.length) { if (currentTrackIndex < 0) currentTrackIndex = 0; playTrack(tracks[currentTrackIndex]); return; }
        if (audio.paused) audio.play().catch(() => { }); else audio.pause();
    }
    function playNext() {
        const tracks = getCurrentTracks(); if (!tracks.length) return;
        endListenSession();
        currentTrackIndex = loopMode === 'shuffle' ? Math.floor(Math.random() * tracks.length) : (currentTrackIndex + 1) % tracks.length;
        saveState(); playTrack(tracks[currentTrackIndex]);
    }
    function playPrev() {
        const tracks = getCurrentTracks(); if (!tracks.length) return;
        endListenSession();
        currentTrackIndex = loopMode === 'shuffle' ? Math.floor(Math.random() * tracks.length) : (currentTrackIndex - 1 + tracks.length) % tracks.length;
        saveState(); playTrack(tracks[currentTrackIndex]);
    }

    /* ========== 歌单管理 ========== */
    function addLocalFile(file) {
        const fileUrl = URL.createObjectURL(file);
        const track = {
            id: uid('tk'), type: 'local',
            title: file.name.replace(/\.[^.]+$/, ''),
            customTitle: '', source: '本地文件',
            fileName: file.name, fileSize: file.size, fileType: file.type,
            fileUrl, file, duration: 0,
            addedAt: Date.now(), updatedAt: Date.now()
        };
        const tmp = new Audio(fileUrl);
        tmp.addEventListener('loadedmetadata', () => { track.duration = tmp.duration; renderPlaylist(); });
        return track;
    }
    function addTrackToCurrentPlaylist(track) {
        const pl = getCurrentPlaylist();
        if (!pl) return;
        const exists = pl.tracks.some(t => {
            if (t.type === 'bilibili' && track.type === 'bilibili') return t.bvid === track.bvid && t.cid === track.cid;
            if (t.type === 'netease' && track.type === 'netease') return String(t.neteaseId || '') === String(track.neteaseId || '');
            if (t.type === 'local' && track.type === 'local') return t.title === track.title && t.fileSize === track.fileSize;
            return false;
        });
        if (exists) { showToast('该歌曲已在当前歌单中'); return; }
        track.updatedAt = Date.now();
        pl.tracks.push(track);
        pl.updatedAt = Date.now();
        savePlaylists(); renderPlaylist();
        showToast(`已添加到「${pl.name}」`);
        scheduleAutoSync();
    }
    function removeTrackFromPlaylist(playlistId, trackId) {
        const pl = playlists.find(p => p.id === playlistId);
        if (!pl) return;
        const idx = pl.tracks.findIndex(t => t.id === trackId);
        if (idx < 0) return;
        if (pl.tracks[idx].fileUrl && pl.tracks[idx].type === 'local') URL.revokeObjectURL(pl.tracks[idx].fileUrl);
        pl.tracks.splice(idx, 1);
        pl.updatedAt = Date.now();
        if (playlistId === currentPlaylistId && currentTrackIndex >= pl.tracks.length) currentTrackIndex = pl.tracks.length - 1;
        savePlaylists(); saveState(); renderPlaylist();
        scheduleAutoSync();
    }
    function createPlaylist(name, cover) {
        const now = Date.now();
        const pl = { id: uid('pl'), name: name || '新歌单', cover: cover || '', tracks: [], createdAt: now, updatedAt: now, showOnWall: true };
        playlists.push(pl); savePlaylists();
        scheduleAutoSync();
        return pl;
    }
    function deletePlaylist(playlistId) {
        const idx = playlists.findIndex(p => p.id === playlistId);
        if (idx < 0) return;
        if (playlists.length === 1) { showToast('至少保留一个歌单'); return; }
        if (!window.confirm(`确定删除歌单「${playlists[idx].name}」吗？`)) return;
        playlists[idx].tracks.forEach(t => { if (t.fileUrl && t.type === 'local') URL.revokeObjectURL(t.fileUrl); });
        playlists.splice(idx, 1);
        if (currentPlaylistId === playlistId) {
            currentPlaylistId = playlists[0].id;
            currentTrackIndex = -1;
            if (currentTrack) {
                const i2 = playlists[0].tracks.findIndex(t => t.id === currentTrack.id);
                if (i2 >= 0) currentTrackIndex = i2;
            }
        }
        savePlaylists(); saveState();
        renderPlaylist(); renderPlaylistTabs(); renderPlaylistHead();
        updateNowPlayingUI(); updateFabIcon(); notifyNativePlayState();
        scheduleAutoSync();
    }

    /* ========== Toast ========== */
    let currentToast = null, currentToastTimer = null;
    function showToast(msg) {
        if (currentToast) { try { currentToast.remove(); } catch (e) { } }
        if (currentToastTimer) clearTimeout(currentToastTimer);
        const isDark = panel ? panel.dataset.theme !== 'light' : true;
        const el = document.createElement('div');
        el.textContent = msg;
        const bg = isDark ? 'rgba(255,255,255,0.78)' : 'rgba(24,24,28,0.72)';
        const fg = isDark ? '#000' : '#fff';
        el.style.cssText = `position:fixed;left:50%;bottom:80px;transform:translateX(-50%) translateY(18px) scale(.9);background:${bg};color:${fg};padding:10px 18px;border-radius:12px;font-size:13px;z-index:2147483647;font-family:-apple-system,system-ui,sans-serif;-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 0 0 .5px rgba(255,255,255,.22),0 8px 24px rgba(0,0,0,0.25);opacity:0;transition:opacity .25s ease,transform .55s cubic-bezier(.34,1.56,.64,1);will-change:transform,opacity;pointer-events:none;max-width:82vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
        document.body.appendChild(el);
        currentToast = el;
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0) scale(1)'; });
        currentToastTimer = setTimeout(() => {
            el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(10px) scale(.94)';
            setTimeout(() => { if (el.parentElement) el.remove(); if (currentToast === el) currentToast = null; }, 260);
        }, 2200);
    }

    /* ==================== CSS ==================== */
    GM_addStyle(`
#xmp-panel,#xmp-fab{
--bg-base:#0a0a0a;--bg-1:#1a1a1a;--bg-2:#262626;--bg-3:#333;
--fg-1:#fff;--fg-2:#8c8c8c;--fg-3:#5c5c5c;
--line:rgba(255,255,255,.08);--line-strong:rgba(255,255,255,.15);
--btn-bg:rgba(255,255,255,.08);--btn-hover:rgba(255,255,255,.14);
--accent:#fff;--accent-fg:#000;
--r-sm:8px;--r-md:12px;--r-lg:16px;--r-xl:20px;--r-full:999px;
}
#xmp-panel[data-theme="light"],#xmp-fab[data-theme="light"]{
--bg-base:#f5f5f7;--bg-1:#fff;--bg-2:#f0f0f2;--bg-3:#e5e5e7;
--fg-1:#000;--fg-2:#6e6e73;--fg-3:#aeaeb2;
--line:rgba(0,0,0,.08);--line-strong:rgba(0,0,0,.15);
--btn-bg:rgba(0,0,0,.05);--btn-hover:rgba(0,0,0,.09);
--accent:#000;--accent-fg:#fff;
}
#xmp-fab{position:fixed;width:56px;height:56px;border-radius:var(--r-full);background:var(--accent);cursor:pointer;z-index:2147483645;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;touch-action:none;box-shadow:0 6px 20px rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.15);transition:transform .18s ease,box-shadow .18s ease;}
#xmp-fab:hover{transform:scale(1.06);}
#xmp-fab.dragging{transform:scale(1.1);transition:none;}
#xmp-fab .xmp-fab-icon{width:50%;height:50%;display:flex;align-items:center;justify-content:center;color:var(--accent-fg);}
#xmp-fab .xmp-fab-icon svg{width:100%;height:100%;}
#xmp-fab .xmp-fab-playing-ring{position:absolute;inset:-4px;border-radius:inherit;border:1.5px solid var(--accent);opacity:.5;animation:xmp-ring 1.8s ease-in-out infinite;pointer-events:none;}
@keyframes xmp-ring{0%,100%{opacity:.2;transform:scale(1);}50%{opacity:.6;transform:scale(1.05);}}
#xmp-panel{position:fixed;width:360px;height:600px;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);background:var(--panel-bg, var(--bg-1));border-radius:var(--r-xl);color:var(--fg-1);box-shadow:0 24px 60px rgba(0,0,0,.4),0 4px 12px rgba(0,0,0,.2);z-index:2147483644;display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(-6px) scale(.96);transform-origin:top right;pointer-events:none;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC',system-ui,sans-serif;transition:opacity .2s ease,transform .26s cubic-bezier(.32,.72,0,1);}
#xmp-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
#xmp-panel.embed{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;border-radius:0!important;transform:none!important;opacity:1!important;pointer-events:auto!important;transition:none!important;box-shadow:none!important;}
#xmp-panel.embed #xmp-close-btn{display:none!important;}
#xmp-panel .xmp-bg-layer{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;}
#xmp-panel .xmp-bg-image{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat;transition:all .4s ease;}
#xmp-panel .xmp-bg-dim{position:absolute;inset:0;background:transparent;transition:background .4s ease;}
#xmp-panel .xmp-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 10px;flex-shrink:0;cursor:grab;}
#xmp-panel .xmp-header:active{cursor:grabbing;}
#xmp-panel .xmp-title{font-size:15px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:6px;}
#xmp-panel .xmp-title svg{width:16px;height:16px;opacity:.7;}
#xmp-panel .xmp-header-actions{display:flex;gap:4px;}
#xmp-panel .xmp-icon-btn{width:32px;height:32px;border:none;background:transparent;color:var(--fg-2);cursor:pointer;border-radius:var(--r-full);display:flex;align-items:center;justify-content:center;font-size:16px;font-family:inherit;padding:0;transition:background .15s,color .15s;}
#xmp-panel .xmp-icon-btn:hover{background:var(--btn-bg);color:var(--fg-1);}
#xmp-panel .xmp-tabs{display:flex;margin:0 14px 12px;padding:3px;background:var(--bg-2);border-radius:var(--r-sm);flex-shrink:0;}
#xmp-panel .xmp-tab{flex:1;font-family:inherit;font-size:13px;font-weight:500;padding:7px 10px;border:none;background:transparent;color:var(--fg-2);border-radius:6px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;}
#xmp-panel .xmp-tab.active{background:var(--bg-1);color:var(--fg-1);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.2);}
#xmp-panel[data-theme="light"] .xmp-tab.active{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08);}
#xmp-panel .xmp-view{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;position:absolute;left:0;right:0;top:0;bottom:0;z-index:1;}
#xmp-panel .xmp-player{padding:8px 20px 16px;display:flex;flex-direction:column;align-items:center;flex-shrink:0;}
#xmp-panel .xmp-cover{width:100%;aspect-ratio:1;max-height:180px;border-radius:var(--r-lg);background:var(--bg-2);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:16px;box-shadow:0 8px 28px rgba(0,0,0,.28);}
#xmp-panel .xmp-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-cover-placeholder{width:36%;height:36%;opacity:.25;color:var(--fg-1);}
#xmp-panel .xmp-now-title{font-size:16px;font-weight:600;text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em;margin-bottom:3px;}
#xmp-panel .xmp-now-artist{font-size:12px;color:var(--fg-2);text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:16px;}
#xmp-panel .xmp-progress-wrap{width:100%;margin-bottom:14px;padding:6px 0;}
#xmp-panel .xmp-progress-track{width:100%;height:3px;background:var(--btn-bg);border-radius:2px;overflow:hidden;position:relative;cursor:pointer;}
#xmp-panel .xmp-progress-inner{height:100%;width:0%;background:var(--fg-1);border-radius:2px;transition:width .15s linear;}
#xmp-panel .xmp-time{font-size:11px;color:var(--fg-2);font-variant-numeric:tabular-nums;text-align:center;margin-top:6px;pointer-events:none;}
#xmp-panel .xmp-controls{display:flex;align-items:center;justify-content:center;gap:28px;margin-top:6px;width:100%;}
#xmp-panel .xmp-ctrl-btn{width:40px;height:40px;border:none;background:transparent;color:var(--fg-1);cursor:pointer;border-radius:var(--r-full);display:flex;align-items:center;justify-content:center;font-family:inherit;padding:0;transition:transform .1s,opacity .15s;opacity:.85;}
#xmp-panel .xmp-ctrl-btn:hover{opacity:1;}
#xmp-panel .xmp-ctrl-btn:active{transform:scale(.9);}
#xmp-panel .xmp-ctrl-btn svg{width:22px;height:22px;}
#xmp-panel .xmp-ctrl-btn.xmp-play-btn{width:60px;height:60px;background:var(--accent-grad,var(--accent));color:var(--accent-fg);opacity:1;box-shadow:0 6px 20px rgba(0,0,0,.25);}
#xmp-panel .xmp-ctrl-btn.xmp-play-btn svg{width:26px;height:26px;}
#xmp-panel .xmp-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 18px 16px;gap:8px;flex-shrink:0;}
#xmp-panel .xmp-footer-btn{font-family:inherit;font-size:13px;font-weight:500;padding:8px 14px;border:1px solid var(--line);background:transparent;color:var(--fg-1);border-radius:var(--r-full);cursor:pointer;display:flex;align-items:center;gap:5px;transition:background .15s,border-color .15s;}
#xmp-panel .xmp-footer-btn:hover{background:var(--btn-bg);border-color:var(--line-strong);}
#xmp-panel .xmp-footer-btn.primary{background:var(--btn-bg);border-color:transparent;}
#xmp-panel .xmp-status{flex-shrink:0;border-top:1px solid var(--line);background:var(--bg-base);}
#xmp-panel .xmp-status-bar{display:flex;align-items:center;gap:8px;padding:6px 14px;font-size:11px;cursor:pointer;user-select:none;transition:background .15s;}
#xmp-panel .xmp-status-bar:hover{background:var(--btn-bg);}
#xmp-panel .xmp-status-indicator{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:var(--fg-3);transition:background .3s;}
#xmp-panel .xmp-status-indicator[data-stage="API"],
#xmp-panel .xmp-status-indicator[data-stage="FAV"],
#xmp-panel .xmp-status-indicator[data-stage="SEASON"],
#xmp-panel .xmp-status-indicator[data-stage="PARTS"],
#xmp-panel .xmp-status-indicator[data-stage="PLAY"],
#xmp-panel .xmp-status-indicator[data-stage="AUDIO"],
#xmp-panel .xmp-status-indicator[data-stage="SYNC"]{background:#4ade80;animation:xmp-status-pulse 1.2s ease-in-out infinite;}
#xmp-panel .xmp-status-indicator[data-stage="ERR"]{background:#f87171;animation:none;}
#xmp-panel .xmp-status-indicator[data-stage="LIST"]{background:var(--fg-2);}
@keyframes xmp-status-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
#xmp-panel .xmp-status-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg-2);font-family:ui-monospace,'SF Mono',monospace;letter-spacing:-.01em;}
#xmp-panel .xmp-status-toggle{color:var(--fg-3);font-size:9px;flex-shrink:0;}
#xmp-panel .xmp-status-log{display:none;flex-direction:column;max-height:150px;overflow-y:auto;padding:4px 14px 8px;font-family:ui-monospace,'SF Mono',monospace;font-size:10px;line-height:1.6;border-top:1px solid var(--line);}
#xmp-panel .xmp-status-log::-webkit-scrollbar{width:3px;}
#xmp-panel .xmp-status-log::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:2px;}
#xmp-panel .xmp-log-item{display:flex;gap:6px;align-items:baseline;color:var(--fg-2);padding:1px 0;}
#xmp-panel .xmp-log-time{color:var(--fg-3);flex-shrink:0;}
#xmp-panel .xmp-log-stage{flex-shrink:0;padding:0 4px;border-radius:3px;background:var(--btn-bg);color:var(--fg-2);font-size:9px;}
#xmp-panel .xmp-log-stage[data-stage="ERR"]{background:rgba(248,113,113,.2);color:#f87171;}
#xmp-panel .xmp-log-stage[data-stage="API"],
#xmp-panel .xmp-log-stage[data-stage="FAV"],
#xmp-panel .xmp-log-stage[data-stage="SEASON"],
#xmp-panel .xmp-log-stage[data-stage="PARTS"],
#xmp-panel .xmp-log-stage[data-stage="PLAY"],
#xmp-panel .xmp-log-stage[data-stage="AUDIO"],
#xmp-panel .xmp-log-stage[data-stage="SYNC"]{background:rgba(74,222,128,.15);color:#4ade80;}
#xmp-panel .xmp-log-msg{flex:1;min-width:0;word-break:break-all;}
#xmp-panel .xmp-playlist-view{flex:1;min-height:0;display:flex;flex-direction:column;}
#xmp-panel .xmp-playlist-tabs{display:flex;gap:6px;padding:0 14px 10px;overflow-x:auto;-webkit-overflow-scrolling:touch;flex-shrink:0;}
#xmp-panel .xmp-playlist-tabs::-webkit-scrollbar{height:0;}
#xmp-panel .xmp-playlist-pill{display:flex;align-items:center;gap:6px;padding:6px 10px 6px 6px;border:1px solid var(--line);background:transparent;color:var(--fg-2);border-radius:var(--r-full);cursor:pointer;transition:all .15s;white-space:nowrap;flex-shrink:0;font-family:inherit;font-size:12px;}
#xmp-panel .xmp-playlist-pill:hover{background:var(--btn-bg);color:var(--fg-1);}
#xmp-panel .xmp-playlist-pill.active{background:var(--fg-1);border-color:var(--fg-1);color:var(--bg-1);}
#xmp-panel .xmp-playlist-pill-cover{width:20px;height:20px;border-radius:var(--r-full);background:var(--btn-bg);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}
#xmp-panel .xmp-playlist-pill-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-playlist-pill-cover svg{width:60%;height:60%;opacity:.5;}
#xmp-panel .xmp-playlist-pill-name{max-width:100px;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-playlist-pill-add{width:28px;height:28px;border:1px dashed var(--line-strong);background:transparent;color:var(--fg-2);border-radius:var(--r-full);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:all .15s;font-family:inherit;}
#xmp-panel .xmp-playlist-pill-add:hover{border-style:solid;color:var(--fg-1);background:var(--btn-bg);}

/* 搜索框 */
#xmp-panel .xmp-search-wrap{padding:0 14px 10px;flex-shrink:0;}
#xmp-panel .xmp-search-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--bg-2);color:var(--fg-1);outline:none;transition:border-color .15s;}
#xmp-panel .xmp-search-input:focus{border-color:var(--line-strong);}
#xmp-panel .xmp-search-input::placeholder{color:var(--fg-3);}
#xmp-panel .xmp-search-section-title{padding:6px 18px 6px;font-size:11px;font-weight:600;color:var(--fg-2);text-transform:uppercase;letter-spacing:.06em;}

#xmp-panel .xmp-stats-summary{padding:2px 14px 12px;flex-shrink:0;}
#xmp-panel .xmp-stats-title{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;margin-bottom:10px;letter-spacing:-.01em;}
#xmp-panel .xmp-stats-title svg{width:16px;height:16px;opacity:.7;}
#xmp-panel .xmp-stats-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}
#xmp-panel .xmp-stats-card{padding:10px 12px;border-radius:var(--r-md);background:var(--bg-2);cursor:pointer;transition:all .15s;border:1.5px solid transparent;}
#xmp-panel .xmp-stats-card:hover{background:var(--btn-bg);}
#xmp-panel .xmp-stats-card.active{border-color:var(--fg-1);background:var(--btn-bg);}
#xmp-panel .xmp-stats-card-label{font-size:11px;color:var(--fg-2);margin-bottom:4px;}
#xmp-panel .xmp-stats-card-value{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-stats-card-sub{font-size:10px;color:var(--fg-3);margin-top:2px;}
#xmp-panel .xmp-stats-hint{font-size:11px;color:var(--fg-3);line-height:1.5;}
#xmp-panel .xmp-hours-entry{margin-left:auto;font-family:inherit;font-size:11px;font-weight:500;padding:5px 10px;border:1px solid var(--line-strong);background:transparent;color:var(--fg-1);border-radius:var(--r-full);cursor:pointer;transition:all .15s;letter-spacing:-.01em;}
#xmp-panel .xmp-hours-entry:hover{background:var(--btn-bg);border-color:var(--fg-2);}

#xmp-panel .xmp-playlist-head{display:flex;align-items:center;gap:14px;padding:4px 18px 14px;flex-shrink:0;}
#xmp-panel .xmp-playlist-cover{width:var(--xmp-cover-size,56px);height:var(--xmp-cover-size,56px);border-radius:var(--r-md);background:var(--bg-2);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;position:relative;flex-shrink:0;transition:transform .15s;}
#xmp-panel .xmp-playlist-cover:hover{transform:scale(1.03);}
#xmp-panel .xmp-playlist-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-playlist-cover-placeholder{width:44%;height:44%;opacity:.3;color:var(--fg-1);}
#xmp-panel .xmp-playlist-cover-overlay{position:absolute;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;color:#fff;font-size:11px;}
#xmp-panel .xmp-playlist-cover:hover .xmp-playlist-cover-overlay{display:flex;}
#xmp-panel .xmp-playlist-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
#xmp-panel .xmp-playlist-name{font-size:16px;font-weight:600;display:flex;align-items:center;gap:5px;cursor:pointer;letter-spacing:-.01em;width:fit-content;max-width:100%;}
#xmp-panel .xmp-playlist-name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;}
#xmp-panel .xmp-playlist-name svg{width:12px;height:12px;opacity:.4;}
#xmp-panel .xmp-playlist-name-input{font-family:inherit;font-size:16px;font-weight:600;background:var(--bg-2);color:var(--fg-1);border:1px solid var(--line-strong);border-radius:6px;padding:3px 6px;outline:none;width:100%;box-sizing:border-box;}
#xmp-panel .xmp-playlist-count{font-size:12px;color:var(--fg-2);}
#xmp-panel .xmp-playlist-actions{display:flex;gap:6px;flex-shrink:0;}
#xmp-panel .xmp-playlist-action{width:32px;height:32px;border:none;background:var(--btn-bg);color:var(--fg-2);border-radius:var(--r-full);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:all .15s;}
#xmp-panel .xmp-playlist-action:hover{background:var(--btn-hover);color:var(--fg-1);}
#xmp-panel .xmp-playlist-toolbar{display:flex;align-items:center;justify-content:space-between;padding:0 18px 8px;flex-shrink:0;}
#xmp-panel .xmp-loop-modes{display:flex;background:var(--bg-2);border-radius:var(--r-sm);padding:2px;}
#xmp-panel .xmp-loop-btn{width:32px;height:26px;border:none;background:transparent;color:var(--fg-2);cursor:pointer;border-radius:5px;display:flex;align-items:center;justify-content:center;padding:0;transition:all .15s;}
#xmp-panel .xmp-loop-btn:hover{color:var(--fg-1);}
#xmp-panel .xmp-loop-btn.active{background:var(--bg-1);color:var(--fg-1);box-shadow:0 1px 2px rgba(0,0,0,.15);}
#xmp-panel .xmp-playlist-list{flex:1;min-height:0;overflow-y:auto;padding:0 10px 14px;-webkit-overflow-scrolling:touch;}
#xmp-panel .xmp-playlist-list::-webkit-scrollbar{width:3px;}
#xmp-panel .xmp-playlist-list::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:2px;}
#xmp-panel .xmp-track-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s;position:relative;}
#xmp-panel .xmp-track-item:hover{background:var(--btn-bg);}
#xmp-panel .xmp-track-item.current{background:var(--btn-bg);}
#xmp-panel .xmp-track-item.disabled{opacity:.55;cursor:not-allowed;}
#xmp-panel .xmp-track-index{width:18px;text-align:center;font-size:12px;color:var(--fg-3);flex-shrink:0;font-variant-numeric:tabular-nums;}
#xmp-panel .xmp-track-item.current .xmp-track-index{color:var(--fg-1);}
#xmp-panel .xmp-track-info{flex:1;min-width:0;}
#xmp-panel .xmp-track-name{font-size:14px;font-weight:500;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.005em;}
#xmp-panel .xmp-track-source{font-size:11px;color:var(--fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
#xmp-panel .xmp-track-actions{display:flex;gap:4px;opacity:0;transition:opacity .12s;}
#xmp-panel .xmp-track-item:hover .xmp-track-actions{opacity:1;}
#xmp-panel .xmp-track-action{width:28px;height:28px;border:none;background:transparent;color:var(--fg-2);cursor:pointer;border-radius:var(--r-full);display:flex;align-items:center;justify-content:center;padding:0;transition:all .12s;}
#xmp-panel .xmp-track-action:hover{background:var(--btn-hover);color:var(--fg-1);}
#xmp-panel .xmp-track-edit{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0;}
#xmp-panel .xmp-track-edit input{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--bg-2);color:var(--fg-1);outline:none;width:100%;box-sizing:border-box;}
#xmp-panel .xmp-track-edit-actions{display:flex;gap:4px;align-items:center;flex-shrink:0;}
#xmp-panel .xmp-track-edit-btn{width:32px;height:32px;border:none;background:var(--btn-bg);color:var(--fg-1);border-radius:var(--r-full);cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;padding:0;transition:all .12s;}
#xmp-panel .xmp-track-edit-btn:hover{background:var(--btn-hover);}
#xmp-panel .xmp-playlist-empty{text-align:center;padding:60px 20px;color:var(--fg-3);font-size:13px;line-height:1.7;}

#xmp-panel .xmp-add-view{padding:0 18px 16px;flex:1;min-height:0;overflow-y:auto;}
#xmp-panel .xmp-add-section{margin-bottom:20px;}
#xmp-panel .xmp-add-section-title{font-size:11px;font-weight:600;color:var(--fg-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
#xmp-panel .xmp-add-input-row{display:flex;gap:8px;}
#xmp-panel .xmp-add-input{flex:1;min-width:0;font-family:inherit;font-size:14px;padding:10px 14px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--bg-2);color:var(--fg-1);outline:none;transition:border-color .15s;}
#xmp-panel .xmp-add-input:focus{border-color:var(--line-strong);}
#xmp-panel .xmp-add-input::placeholder{color:var(--fg-3);}
#xmp-panel .xmp-add-btn{font-family:inherit;font-size:14px;font-weight:600;padding:0 18px;border:none;background:var(--accent-grad,var(--accent));color:var(--accent-fg);border-radius:var(--r-md);cursor:pointer;flex-shrink:0;transition:opacity .15s;}
#xmp-panel .xmp-add-btn:hover{opacity:.85;}
#xmp-panel .xmp-add-btn:disabled{opacity:.4;cursor:not-allowed;}
#xmp-panel .xmp-add-hint{font-size:12px;color:var(--fg-2);margin-top:6px;line-height:1.5;}
#xmp-panel .xmp-add-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg-2);cursor:pointer;user-select:none;padding:8px 0 4px;line-height:1.4;}
#xmp-panel .xmp-add-checkbox:hover{color:var(--fg-1);}
#xmp-panel .xmp-add-checkbox input[type="checkbox"]{appearance:none;-webkit-appearance:none;width:18px;height:18px;border:1.5px solid var(--line-strong);border-radius:5px;background:transparent;cursor:pointer;position:relative;flex-shrink:0;transition:all .15s;margin:0;}
#xmp-panel .xmp-add-checkbox input[type="checkbox"]:checked{background:var(--accent);border-color:var(--accent);}
#xmp-panel .xmp-add-checkbox input[type="checkbox"]:checked::after{content:'';position:absolute;top:2px;left:6px;width:4px;height:9px;border:solid var(--accent-fg);border-width:0 2px 2px 0;transform:rotate(45deg);}
#xmp-panel .xmp-drop-zone{border:1.5px dashed var(--line-strong);border-radius:var(--r-md);padding:26px 20px;text-align:center;cursor:pointer;transition:all .2s;color:var(--fg-2);font-size:13px;background:var(--bg-2);}
#xmp-panel .xmp-drop-zone:hover{border-color:var(--fg-2);color:var(--fg-1);}
#xmp-panel .xmp-drop-zone svg{width:28px;height:28px;margin-bottom:8px;opacity:.5;}
#xmp-panel .xmp-fav-progress{margin-top:10px;padding:12px 14px;border-radius:var(--r-md);background:var(--bg-2);}
#xmp-panel .xmp-fav-progress-bar{width:100%;height:3px;background:var(--btn-bg);border-radius:2px;overflow:hidden;}
#xmp-panel .xmp-fav-progress-inner{height:100%;width:0%;background:var(--fg-1);border-radius:2px;transition:width .3s ease;}
#xmp-panel .xmp-fav-progress-text{font-size:12px;color:var(--fg-2);margin-top:8px;line-height:1.5;word-break:break-all;}
#xmp-panel .xmp-settings-view{flex:1;min-height:0;display:flex;flex-direction:column;}
#xmp-panel .xmp-settings-body{flex:1;min-height:0;overflow-y:auto;padding:12px 18px 140px;}
#xmp-panel .xmp-color-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:100%;}
#xmp-panel .xmp-color-swatch{border:2px solid transparent;border-radius:14px;padding:0;height:52px;cursor:pointer;position:relative;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.25);}
#xmp-panel .xmp-color-swatch.active{border-color:#fff;box-shadow:0 0 0 2px var(--accent),0 4px 14px rgba(0,0,0,.35);}
#xmp-panel[data-theme="light"] .xmp-color-swatch.active{border-color:#111;}
#xmp-panel .xmp-color-swatch span{position:absolute;left:0;right:0;bottom:0;padding:3px 4px;font-size:9px;font-weight:600;text-align:center;background:rgba(0,0,0,.45);color:#fff;}
#xmp-panel .xmp-mini-play{background:var(--accent-grad,var(--accent))!important;color:var(--accent-fg)!important;}

#xmp-panel .xmp-settings-body::-webkit-scrollbar{width:3px;}
#xmp-panel .xmp-settings-body::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:2px;}
#xmp-panel .xmp-setting-group{font-size:11px;font-weight:600;color:var(--fg-2);text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px;padding:0 2px;}
#xmp-panel .xmp-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);}
#xmp-panel .xmp-setting-row:last-child{border-bottom:none;}
#xmp-panel .xmp-setting-row label{font-size:14px;flex-shrink:0;letter-spacing:-.005em;}
#xmp-panel .xmp-setting-control{display:flex;align-items:center;gap:10px;flex:1;justify-content:flex-end;min-width:0;}
#xmp-panel .xmp-setting-control input[type="range"]{flex:1;min-width:0;height:3px;-webkit-appearance:none;appearance:none;background:var(--btn-bg);border-radius:2px;outline:none;cursor:pointer;}
#xmp-panel .xmp-setting-control input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;background:var(--accent);border-radius:50%;cursor:pointer;border:none;box-shadow:0 2px 6px rgba(0,0,0,.2);}
#xmp-panel .xmp-setting-control select{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-2);color:var(--fg-1);cursor:pointer;outline:none;min-width:80px;}
#xmp-panel .xmp-setting-value{font-size:12px;color:var(--fg-2);min-width:42px;text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0;}
#xmp-panel .xmp-setting-btn{font-family:inherit;font-size:13px;font-weight:500;padding:8px 16px;border:1px solid var(--line);background:transparent;color:var(--fg-1);border-radius:var(--r-full);cursor:pointer;transition:all .15s;}
#xmp-panel .xmp-setting-btn:hover{background:var(--btn-bg);border-color:var(--line-strong);}
#xmp-panel .xmp-setting-btn.danger{color:var(--fg-2);}
#xmp-panel .xmp-setting-preview{width:100%;height:100px;border-radius:var(--r-md);background:var(--bg-2);background-size:cover;background-position:center;margin-top:10px;border:1px solid var(--line);position:relative;overflow:hidden;}
#xmp-panel .xmp-setting-preview:empty::after{content:'暂无图片';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--fg-3);font-size:12px;}
#xmp-panel .xmp-vinyl-wrap{display:none;width:min(200px,100%);aspect-ratio:1/1;margin:0 auto 16px;position:relative;}
#xmp-panel.vinyl .xmp-vinyl-wrap{display:block;}
#xmp-panel.vinyl .xmp-cover{display:none!important;}
#xmp-panel .xmp-vinyl{position:absolute;inset:8%;border-radius:50%;background:repeating-radial-gradient(circle at 50% 50%,#0a0a0a 0,#0a0a0a 1px,#1a1a1a 1.5px,#1a1a1a 2.5px,#0a0a0a 3px,#0a0a0a 4px);box-shadow:inset 0 0 40px rgba(0,0,0,.9),0 8px 32px rgba(0,0,0,.5);animation:xmp-vinyl-spin 14s linear infinite;animation-play-state:paused;}
#xmp-panel .xmp-vinyl.spinning{animation-play-state:running;}
@keyframes xmp-vinyl-spin{to{transform:rotate(360deg);}}
#xmp-panel .xmp-vinyl-label{position:absolute;inset:26%;border-radius:50%;overflow:hidden;background:#1a1a1a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;z-index:2;}
#xmp-panel .xmp-vinyl-label img{width:100%;height:100%;object-fit:cover;display:block;}
#xmp-panel .xmp-vinyl-label-placeholder{width:50%;height:50%;color:rgba(255,255,255,.3);}
#xmp-panel .xmp-vinyl-label-placeholder svg{width:100%;height:100%;}
#xmp-panel .xmp-vinyl-hole{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:#000;z-index:3;}
#xmp-panel .xmp-vinyl-arm{position:absolute;top:4%;right:4%;width:88%;height:88%;transform-origin:100% 0;transform:rotate(-10deg);transition:transform .6s cubic-bezier(.4,0,.2,1);pointer-events:none;z-index:5;}
#xmp-panel .xmp-vinyl-arm.playing{transform:rotate(24deg);}
#xmp-panel .xmp-vinyl-arm-body{position:absolute;top:0;right:0;width:3px;height:95%;background:linear-gradient(180deg,#e6e6e6 0%,#999 40%,#4d4d4d 100%);border-radius:2px;transform-origin:top right;}
#xmp-panel .xmp-vinyl-arm-body::after{content:'';position:absolute;bottom:-12px;left:50%;transform:translateX(-50%) rotate(-25deg);width:10px;height:16px;border-radius:2px;background:linear-gradient(180deg,#b3b3b3 0%,#4d4d4d 100%);}
#xmp-panel .xmp-vinyl-arm-pivot{position:absolute;top:-10px;right:-10px;width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#e6e6e6 0%,#666 60%,#1a1a1a 100%);z-index:6;}

/* 时段统计视图 */
#xmp-panel .xmp-hours-view{position:absolute;inset:0;z-index:20;background:var(--bg-1);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .34s cubic-bezier(.32,.72,0,1);will-change:transform;}
#xmp-panel .xmp-hours-view.open{transform:translateX(0);}
#xmp-panel .xmp-hours-view.dragging{transition:none;}
#xmp-panel .xmp-hours-header{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;flex-shrink:0;}
#xmp-panel .xmp-hours-back{width:40px;height:40px;border:none;background:transparent;color:var(--fg-1);cursor:pointer;border-radius:var(--r-full);display:flex;align-items:center;justify-content:center;font-family:inherit;padding:0;transition:background .15s;}
#xmp-panel .xmp-hours-back:hover{background:var(--btn-bg);}
#xmp-panel .xmp-hours-back svg{width:20px;height:20px;}
#xmp-panel .xmp-hours-title{font-size:16px;font-weight:600;letter-spacing:-.01em;}
#xmp-panel .xmp-hours-body{flex:1;min-height:0;overflow-y:auto;padding:4px 14px 24px;}
#xmp-panel .xmp-chart-block{margin-bottom:22px;padding:14px 12px 10px;background:var(--bg-2);border-radius:var(--r-lg);}
#xmp-panel .xmp-chart-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;padding:0 4px;}
#xmp-panel .xmp-chart-title{font-size:13px;font-weight:600;color:var(--fg-1);}
#xmp-panel .xmp-chart-hint{font-size:11px;color:var(--fg-2);font-variant-numeric:tabular-nums;}
#xmp-panel .xmp-chart-wrap{width:100%;height:150px;position:relative;color:var(--fg-2);}
#xmp-panel .xmp-chart-svg{width:100%;height:100%;display:block;overflow:visible;}
`);


    GM_addStyle(`
/* ===== 唱片墙 / 底部导航 ===== */
#xmp-panel.embed .xmp-header{display:none;}
#xmp-panel.embed .xmp-tabs{display:none;}
#xmp-panel.embed .xmp-status{display:none;}
#xmp-panel.embed{padding-bottom:0;}

#xmp-panel .xmp-wall-view{flex:1;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;background:var(--wall-bg, #0a0a0c);}
#xmp-panel .xmp-wall-search{display:none;flex-shrink:0;padding:10px 12px 6px;gap:8px;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,.06);z-index:8;position:relative;}
#xmp-panel .xmp-wall-search.open{display:flex;}
#xmp-panel .xmp-wall-search-field{position:relative;flex:1 1 auto;min-width:0;max-width:380px;}
#xmp-panel .xmp-wall-search-input{width:100%;box-sizing:border-box;height:36px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:var(--fg-1);padding:0 48px 0 14px;font-size:14px;outline:none;font-family:inherit;}
#xmp-panel .xmp-wall-search-input:focus{border-color:rgba(10,132,255,.6);}
#xmp-panel .xmp-wall-search-btn{width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.1);color:var(--fg-1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;line-height:1;}
#xmp-panel .xmp-wall-search-btn:active{background:rgba(255,255,255,.18);}
#xmp-panel .xmp-wall-search-meta{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--fg-2);pointer-events:none;text-align:right;}
#xmp-panel .xmp-wall-viewport{flex:1;min-height:0;position:relative;overflow:hidden;touch-action:none;cursor:grab;background:var(--wall-bg, #0a0a0c);}
#xmp-panel .xmp-wall-viewport.is-dragging{cursor:grabbing;}
#xmp-panel .xmp-wall-edge{position:absolute;z-index:3;pointer-events:none;display:none;-webkit-backdrop-filter:blur(var(--wall-edge-blur,6px));backdrop-filter:blur(var(--wall-edge-blur,6px));}
#xmp-panel .xmp-wall-edge.on{display:block;}
#xmp-panel .xmp-wall-edge.e-t{left:0;right:0;top:0;height:var(--wall-edge-dist,70px);}
#xmp-panel .xmp-wall-edge.e-b{left:0;right:0;bottom:0;height:var(--wall-edge-dist,70px);}
#xmp-panel .xmp-wall-edge.e-l{top:0;bottom:0;left:0;width:var(--wall-edge-dist,70px);}
#xmp-panel .xmp-wall-edge.e-r{top:0;bottom:0;right:0;width:var(--wall-edge-dist,70px);}
#xmp-panel .xmp-wall-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;}
#xmp-panel .xmp-wall-plane{position:absolute;left:0;top:0;will-change:transform;transform-origin:0 0;}
#xmp-panel .xmp-wall-grid{position:relative;width:100%;height:100%;}
#xmp-panel .xmp-wall-item{position:absolute;border-radius:10px;overflow:hidden;cursor:pointer;background:var(--bg-2);transition:filter .28s ease,box-shadow .28s ease,opacity .28s ease,transform .28s cubic-bezier(.32,.72,0,1);touch-action:none;box-shadow:0 4px 14px rgba(0,0,0,.4);}
#xmp-panel .xmp-wall-item img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;-webkit-user-drag:none;}
#xmp-panel .xmp-wall-item .xmp-wall-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:.3;color:var(--fg-1);}
#xmp-panel .xmp-wall-item .xmp-wall-ph svg{width:36%;height:36%;}
#xmp-panel .xmp-wall-item .xmp-wall-title{position:absolute;left:0;right:0;bottom:0;padding:18px 8px 8px;background:linear-gradient(transparent,rgba(0,0,0,.82));color:#fff;font-size:11px;font-weight:600;line-height:1.25;opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
#xmp-panel .xmp-wall-item.selected,#xmp-panel .xmp-wall-item.match{
  z-index:5;
  transform:scale(1.12);
  box-shadow:0 0 0 2px rgba(255,255,255,.95),0 0 calc(var(--wall-glow,18)*1px) calc(var(--wall-glow,18)*0.4px) rgba(255,255,255,.8),0 14px 32px rgba(0,0,0,.5);
}
#xmp-panel .xmp-wall-item.selected .xmp-wall-title,#xmp-panel .xmp-wall-item.match .xmp-wall-title{opacity:1;transform:translateY(0);}
/* 用整层遮罩代替对每个封面做 filter，避免成百上千次重绘 */
#xmp-panel .xmp-wall-dim-mask{
  position:absolute;inset:0;z-index:4;pointer-events:none;
  background:rgba(0,0,0,calc(var(--wall-dim,0.55) * 0.75));
  opacity:0;transition:opacity .2s ease;
}
#xmp-panel .xmp-wall-viewport.is-dimmed .xmp-wall-dim-mask{opacity:1;}
#xmp-panel .xmp-wall-item{
  transition:transform .2s cubic-bezier(.32,.72,0,1),box-shadow .2s ease;
}
#xmp-panel .xmp-wall-viewport.is-dragging .xmp-wall-item,
#xmp-panel .xmp-wall-viewport.is-dragging .xmp-wall-dim-mask{
  transition:none!important;
}
#xmp-panel .xmp-wall-plane{
  will-change:transform;
  backface-visibility:hidden;
  -webkit-backface-visibility:hidden;
}
#xmp-panel .xmp-wall-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:80px 24px;text-align:center;color:var(--fg-3);font-size:14px;line-height:1.7;z-index:2;pointer-events:none;}
#xmp-panel .xmp-wall-item.falling{animation:xmpWallFall var(--wall-fall-dur,0.7s) cubic-bezier(.4,0,.2,1) forwards;pointer-events:none;z-index:20;}
@keyframes xmpWallFall{0%{transform:translateY(0) rotate(0) scale(1);opacity:1;}100%{transform:translateY(110vh) rotate(var(--fall-rot,12deg)) scale(0.85);opacity:0;}}
#xmp-panel .xmp-bottom-nav{
  position:absolute;left:14px;right:14px;
  bottom:calc(10px + env(safe-area-inset-bottom,0px));
  z-index:30;display:flex;align-items:center;justify-content:space-around;
  height:56px;padding:0 6px;
  background:var(--nav-bg, rgba(0,0,0,.75));
  border-radius:28px;
  border:1px solid var(--nav-border, transparent);
  backdrop-filter:blur(var(--nav-blur, 14px));
  -webkit-backdrop-filter:blur(var(--nav-blur, 14px));
  box-shadow:0 8px 28px rgba(0,0,0,.35);
}
#xmp-panel[data-theme="light"] .xmp-bottom-nav{background:var(--nav-bg, rgba(0,0,0,.75));}
#xmp-panel .xmp-nav-btn{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  border:none;background:transparent;color:rgba(255,255,255,.72);
  padding:6px 2px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:500;
  border-radius:20px;
}
#xmp-panel .xmp-nav-btn svg{width:22px;height:22px;stroke:currentColor;}
#xmp-panel .xmp-nav-btn.active{color:#fff;}
#xmp-panel .xmp-nav-btn.active span{font-weight:600;}
#xmp-panel .xmp-mini-bar{position:absolute;left:14px;right:14px;bottom:76px;z-index:29;display:none;align-items:center;gap:10px;padding:10px 12px;background:var(--card-bg-fill, rgba(28,28,30,.94));backdrop-filter:blur(var(--card-blur, 14px));-webkit-backdrop-filter:blur(var(--card-blur, 14px));border-radius:16px;border:1px solid var(--nav-border, rgba(255,255,255,.1));box-shadow:0 10px 28px rgba(0,0,0,.4);}
#xmp-panel[data-theme="light"] .xmp-mini-bar{background:var(--card-bg-fill, rgba(255,255,255,.96));border-color:rgba(0,0,0,.08);}
#xmp-panel .xmp-mini-cover{width:42px;height:42px;border-radius:10px;overflow:hidden;background:var(--bg-2);flex-shrink:0;}
#xmp-panel .xmp-mini-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-mini-info{flex:1;min-width:0;}
#xmp-panel .xmp-mini-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-mini-sub{font-size:11px;color:var(--fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-mini-play{width:34px;height:34px;border:none;border-radius:50%;background:var(--fg-1);color:var(--bg-1);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0;}
#xmp-panel .xmp-mini-play svg{width:15px;height:15px;}
#xmp-panel .xmp-mini-close{width:32px;height:32px;border:none;border-radius:50%;background:transparent;color:var(--fg-2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:18px;line-height:1;padding:0;}
#xmp-panel .xmp-mini-close:active{color:var(--fg-1);background:rgba(255,255,255,.08);}
#xmp-panel.embed .xmp-view{padding-bottom:72px;}
#xmp-panel .xmp-pl-page{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:calc(10px + env(safe-area-inset-top,0px)) 14px 78px;}
#xmp-panel .xmp-pl-page-title{font-size:20px;font-weight:700;letter-spacing:-.02em;margin:4px 4px 10px;color:var(--fg-1);}
#xmp-panel .xmp-pl-card-list{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:8px;padding-bottom:12px;}
#xmp-panel .xmp-pl-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--bg-2);border:1px solid rgba(255,255,255,.06);cursor:pointer;transition:background .15s,transform .15s;flex-shrink:0;}
#xmp-panel .xmp-pl-card:active{transform:scale(.98);background:rgba(255,255,255,.08);}
#xmp-panel[data-theme="light"] .xmp-pl-card{border-color:rgba(0,0,0,.06);}
#xmp-panel .xmp-pl-card-cover{width:56px;height:56px;border-radius:12px;overflow:hidden;background:rgba(128,128,128,.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;}
#xmp-panel .xmp-pl-card-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-pl-card-cover svg{width:28px;height:28px;opacity:.45;}
#xmp-panel .xmp-pl-card-body{flex:1;min-width:0;}
#xmp-panel .xmp-pl-card-name{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-pl-card-meta{font-size:12px;color:var(--fg-2);margin-top:3px;}
#xmp-panel .xmp-pl-card-arrow{color:var(--fg-3);font-size:18px;flex-shrink:0;padding:0 4px;}

/* ===== Apple Music style: 歌单 / 设置 ===== */
#xmp-panel .xmp-pl-page{padding:calc(12px + env(safe-area-inset-top,0px)) 16px 96px;background:transparent;}
#xmp-panel .xmp-pl-page-title{font-size:34px;font-weight:700;letter-spacing:-.04em;margin:8px 0 18px;color:var(--fg-1);}
#xmp-panel .xmp-pl-card{display:flex;align-items:center;gap:14px;padding:10px 4px;border:none;border-radius:0;background:transparent;border-bottom:0.5px solid rgba(128,128,128,.22);margin:0;}
#xmp-panel .xmp-pl-card:active{opacity:.65;}
#xmp-panel .xmp-pl-card-cover{width:56px;height:56px;border-radius:8px;overflow:hidden;background:rgba(128,128,128,.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;}
#xmp-panel .xmp-pl-card-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-pl-card-name{font-size:17px;font-weight:500;color:var(--fg-1);letter-spacing:-.02em;}
#xmp-panel .xmp-pl-card-meta{font-size:13px;color:var(--fg-2);margin-top:2px;}
#xmp-panel .xmp-pl-card-arrow{color:var(--fg-3);font-size:22px;font-weight:300;}
#xmp-panel .xmp-pl-add-row{margin-top:16px;gap:10px;}
#xmp-panel .xmp-pl-add-row .xmp-footer-btn,#xmp-panel .xmp-setting-btn{
  border-radius:12px;font-size:16px;font-weight:600;padding:14px 16px;border:none;
  background:rgba(10,132,255,.14);color:var(--accent,#0A84FF);
}
#xmp-panel .xmp-settings-body{padding:calc(12px + env(safe-area-inset-top,0px)) 16px 100px;}
#xmp-panel .xmp-setting-group{font-size:13px;font-weight:600;color:var(--fg-2);text-transform:uppercase;letter-spacing:.04em;margin:22px 0 8px;padding:0 4px;}
#xmp-panel .xmp-setting-row{background:rgba(120,120,128,.12);border-radius:12px;padding:12px 14px;margin-bottom:8px;border:none;display:flex;align-items:center;justify-content:space-between;gap:12px;}
#xmp-panel .xmp-setting-row select,#xmp-panel .xmp-setting-row input[type="text"],#xmp-panel .xmp-setting-row input[type="color"]{
  border:none;background:transparent;color:var(--fg-1);font-size:16px;text-align:right;max-width:55%;
}
#xmp-panel .xmp-ncm-search-box{margin:0 0 12px;padding:0;}
#xmp-panel .xmp-ncm-search-row{display:flex;gap:8px;align-items:center;}
#xmp-panel .xmp-ncm-search-row input{flex:1;border:none;border-radius:12px;padding:12px 14px;font-size:16px;background:rgba(120,120,128,.16);color:var(--fg-1);}
#xmp-panel .xmp-ncm-search-row button{border:none;border-radius:12px;padding:12px 16px;font-weight:600;background:var(--accent,#0A84FF);color:#fff;}
#xmp-panel .xmp-ncm-result-item{display:flex;gap:12px;align-items:center;padding:10px 4px;border-bottom:0.5px solid rgba(128,128,128,.2);}
#xmp-panel .xmp-ncm-result-item img{width:48px;height:48px;border-radius:6px;object-fit:cover;background:#333;}
#xmp-panel .xmp-ncm-result-meta{flex:1;min-width:0;}
#xmp-panel .xmp-ncm-result-title{font-size:16px;font-weight:500;color:var(--fg-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-ncm-result-sub{font-size:13px;color:var(--fg-2);margin-top:2px;}
#xmp-panel .xmp-ncm-add-btn{border:none;border-radius:16px;padding:8px 12px;font-size:13px;font-weight:600;background:rgba(10,132,255,.15);color:var(--accent,#0A84FF);}
#xmp-panel .xmp-ly-edit-pl{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:16px;z-index:5;
  border:none;border-radius:16px;padding:8px 14px;font-size:14px;font-weight:600;
  background:rgba(120,120,128,.24);color:var(--fg-1);backdrop-filter:blur(12px);}
#xmp-panel.theme-black-default{--fg-1:#f5f5f7;--fg-2:#a1a1a6;--fg-3:#6e6e73;--btn-bg:rgba(44,44,46,.9);}

/* Apple Music 风格歌曲页 */
#xmp-panel .xmp-am-player{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;padding:0 22px 100px;overflow:auto;isolation:isolate;}
#xmp-panel .xmp-am-bg{position:absolute;inset:-20%;background-size:cover;background-position:center;filter:blur(46px) saturate(1.6) brightness(.78);transform:scale(1.15);z-index:0;pointer-events:none;}
#xmp-panel .xmp-am-bg::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.28);pointer-events:none;}
#xmp-panel .xmp-am-player>*{position:relative;z-index:1;}
#xmp-panel .xmp-am-top{width:100%;display:flex;justify-content:center;padding-top:calc(6px + env(safe-area-inset-top,0px));}
#xmp-panel .xmp-am-chevron{border:none;background:rgba(255,255,255,.12);color:rgba(255,255,255,.9);font-size:18px;width:40px;height:28px;border-radius:14px;cursor:pointer;line-height:1;}
#xmp-panel .xmp-am-cover{
  width:min(72vw, 300px);
  height:min(72vw, 300px);
  max-height:33vh;
  border-radius:14px;overflow:hidden;
  box-shadow:0 22px 50px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.2);
  margin:18px 0 20px;cursor:pointer;flex-shrink:0;
}
#xmp-panel .xmp-am-cover img{width:100%;height:100%;object-fit:cover;display:block;}
#xmp-panel .xmp-am-player .xmp-now-title{color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.35);}
#xmp-panel .xmp-am-player .xmp-now-artist{color:rgba(255,255,255,.72);}
#xmp-panel .xmp-am-line-lyric{color:rgba(255,255,255,.88);font-weight:500;}
#xmp-panel .xmp-am-player .xmp-time{color:rgba(255,255,255,.55);}
#xmp-panel .xmp-am-player .xmp-progress-track{background:rgba(255,255,255,.22);}
#xmp-panel .xmp-am-player .xmp-progress-inner{background:#fff;}
#xmp-panel .xmp-am-controls .xmp-ctrl-btn{color:#fff;}
#xmp-panel .xmp-am-fav-btn{background:rgba(255,255,255,.16);color:#fff;}
#xmp-panel .xmp-am-secondary .xmp-loop-btn,#xmp-panel .xmp-am-secondary .xmp-footer-btn{color:rgba(255,255,255,.85);}
#xmp-panel .xmp-am-meta{width:100%;max-width:360px;display:flex;align-items:flex-start;gap:12px;margin-bottom:6px;}
#xmp-panel .xmp-am-meta-text{flex:1;min-width:0;}
#xmp-panel .xmp-am-player .xmp-now-title{font-size:20px;font-weight:700;letter-spacing:-.02em;text-align:left;margin:0;}
#xmp-panel .xmp-am-player .xmp-now-artist{font-size:15px;color:var(--fg-2);text-align:left;margin-top:4px;}
#xmp-panel .xmp-am-icon-btn{width:36px;height:36px;border-radius:50%;border:none;background:rgba(120,120,128,.22);color:var(--fg-1);font-size:18px;font-weight:700;cursor:pointer;}
#xmp-panel .xmp-am-line-lyric{width:100%;max-width:360px;min-height:1.4em;font-size:14px;color:var(--fg-2);text-align:center;margin:8px 0 14px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-am-player .xmp-progress-wrap{width:100%;max-width:360px;}
#xmp-panel .xmp-am-player .xmp-time{display:flex;justify-content:space-between;font-size:12px;color:var(--fg-3);margin-top:6px;}
#xmp-panel .xmp-am-controls{width:100%;max-width:360px;display:flex;justify-content:center;gap:36px;margin:18px 0 8px;}
#xmp-panel .xmp-am-controls .xmp-ctrl-btn{width:52px;height:52px;border-radius:50%;}
#xmp-panel .xmp-am-controls .xmp-play-btn{width:64px;height:64px;}
#xmp-panel .xmp-am-secondary{display:flex;gap:16px;align-items:center;opacity:.85;}
#xmp-panel .xmp-am-sheet-mask{position:absolute;inset:0;background:rgba(0,0,0,.35);z-index:40;}
#xmp-panel .xmp-am-sheet{position:absolute;top:12%;right:12px;width:min(78vw,280px);max-height:70%;overflow:auto;z-index:41;
  background:rgba(28,28,30,.94);backdrop-filter:blur(20px);border-radius:14px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);}
#xmp-panel .xmp-am-sheet-title{font-size:13px;font-weight:600;color:var(--fg-2);margin-bottom:8px;padding:0 4px;}
#xmp-panel .xmp-am-sheet-item{padding:12px 10px;border-radius:10px;font-size:15px;color:var(--fg-1);cursor:pointer;}
#xmp-panel .xmp-am-sheet-item:active{background:rgba(120,120,128,.22);}
#xmp-panel .xmp-am-sheet-new{width:100%;margin-top:8px;border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:600;background:rgba(10,132,255,.18);color:var(--accent,#0A84FF);}
/* 设置页 Apple 分组 */
#xmp-panel .xmp-settings-am{padding:calc(12px + env(safe-area-inset-top,0px)) 16px 110px;}
#xmp-panel .xmp-settings-am .xmp-set-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:12px;margin-bottom:8px;}
#xmp-panel .xmp-settings-am .xmp-set-tab{flex-shrink:0;border:none;border-radius:18px;padding:8px 14px;font-size:13px;font-weight:600;background:rgba(120,120,128,.16);color:var(--fg-2);}
#xmp-panel .xmp-settings-am .xmp-set-tab.active{background:rgba(255,255,255,.92);color:#111;}
#xmp-panel .xmp-settings-am .xmp-set-card{background:rgba(44,44,46,.72);border-radius:14px;padding:4px 0;margin-bottom:14px;}
#xmp-panel .xmp-settings-am .xmp-set-card-title{font-size:13px;font-weight:600;color:var(--fg-2);padding:10px 14px 4px;}
#xmp-panel .xmp-settings-am .xmp-setting-row{background:transparent;border-radius:0;margin:0;border-bottom:0.5px solid rgba(128,128,128,.18);padding:14px 14px;}
#xmp-panel .xmp-settings-am .xmp-setting-row:last-child{border-bottom:none;}
/* 歌单滑动主页 */
#xmp-panel .xmp-carousel-home{position:absolute;inset:0;overflow:hidden;display:none;z-index:2;}
#xmp-panel .xmp-carousel-home.show{display:block;}
#xmp-panel .xmp-carousel-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(40px) brightness(.28);transform:scale(1.25);}
#xmp-panel .xmp-carousel-track{position:absolute;inset:0;display:flex;align-items:center;gap:18px;padding:0 18vw;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;}
#xmp-panel .xmp-carousel-card{scroll-snap-align:center;flex:0 0 58vw;max-width:280px;transition:transform .35s cubic-bezier(.22,1,.36,1),opacity .35s;opacity:.55;transform:scale(.88);}
#xmp-panel .xmp-carousel-card.is-center{opacity:1;transform:scale(1);}
#xmp-panel .xmp-carousel-card-cover{width:100%;aspect-ratio:1;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.4);background:#222;}
#xmp-panel .xmp-carousel-card-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-carousel-card-name{text-align:center;margin-top:14px;font-size:18px;font-weight:700;color:#fff;}
#xmp-panel .xmp-carousel-card-meta{text-align:center;font-size:13px;color:rgba(255,255,255,.65);margin-top:4px;}
/* iPod */
#xmp-panel .xmp-ipod-home{
  position:absolute;inset:0;display:none;flex-direction:column;z-index:3;color:#1a1a1a;
  background:linear-gradient(165deg,#f0d24a 0%,#e8c227 40%,#d4a80f 100%);
  padding: calc(20px + env(safe-area-inset-top, 44px)) 12px 10px;
}
#xmp-panel .xmp-ipod-home.show{display:flex;}
#xmp-panel.ipod-mode .xmp-bottom-nav,#xmp-panel.ipod-mode .xmp-mini-bar{display:none!important;}
#xmp-panel .xmp-nav-wallpick{display:flex;}
#xmp-panel.ipod-mode .xmp-nav-wallpick{display:none!important;}
#xmp-panel[data-home-mode="carousel"] .xmp-nav-wallpick{display:none;}
#xmp-panel[data-home-mode="ipod"] .xmp-nav-wallpick{display:none!important;}
#xmp-panel .xmp-view-search{padding:calc(12px + env(safe-area-inset-top,0px)) 16px 100px;overflow:auto;height:100%;box-sizing:border-box;}
#xmp-panel .xmp-cloud-search-row{display:flex;gap:8px;margin-bottom:12px;}
#xmp-panel .xmp-cloud-search-row input{flex:1;border:none;border-radius:12px;padding:12px 14px;background:rgba(120,120,128,.18);color:var(--fg-1);font-size:15px;outline:none;}
#xmp-panel .xmp-cloud-search-row button{border:none;border-radius:12px;padding:0 16px;background:var(--accent,#0A84FF);color:#fff;font-weight:600;}
#xmp-panel .xmp-cloud-result{display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:12px;cursor:pointer;}
#xmp-panel .xmp-cloud-result:active{background:rgba(120,120,128,.2);}
#xmp-panel .xmp-cloud-result img{width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#222;}
#xmp-panel .xmp-cloud-result-meta{flex:1;min-width:0;}
#xmp-panel .xmp-cloud-result-title{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg-1);}
#xmp-panel .xmp-cloud-result-sub{font-size:12px;color:var(--fg-2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-am-fav-btn{width:40px;height:40px;border-radius:50%;border:none;background:rgba(120,120,128,.22);color:var(--fg-1);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
#xmp-panel .xmp-am-sheet .xmp-am-sheet-item{display:flex;align-items:center;gap:8px;}
#xmp-panel .xmp-am-sheet-confirm{width:100%;margin-top:10px;border:none;border-radius:12px;padding:12px;font-size:15px;font-weight:700;background:var(--accent,#0A84FF);color:#fff;}

#xmp-panel .xmp-ipod-bezel{
  flex:0 0 auto;margin-top: min(4vh, 24px);width:100%;aspect-ratio: 1 / 0.95; max-height:min(48vh, 380px);
  border-radius:16px;padding:10px;box-sizing:border-box;
  background:linear-gradient(145deg,#f5d76e,#c9a00a 55%,#a68608);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -2px 4px rgba(0,0,0,.18),0 6px 16px rgba(0,0,0,.22);
  position:relative;
}
#xmp-panel .xmp-ipod-screen{
  width:100%;height:100%;border-radius:10px;overflow:hidden;position:relative;pointer-events:none;
  background:linear-gradient(180deg,#2a2a2c,#121214);
  box-shadow:inset 0 0 0 2px #1a1a1a,inset 0 3px 10px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.06);
  color:#e8e8e8;
}
#xmp-panel .xmp-ipod-settings{
  position:absolute;top:calc(8px + env(safe-area-inset-top, 28px));right:10px;z-index:6;border:none;
  background:rgba(0,0,0,.28);color:#fff;width:34px;height:34px;border-radius:50%;pointer-events:auto;
  box-shadow:0 2px 6px rgba(0,0,0,.25);
}
#xmp-panel .xmp-ipod-split{display:flex;height:100%;min-height:0;}
#xmp-panel .xmp-ipod-split-cover{
  width:42%;flex-shrink:0;padding:10px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;
}
#xmp-panel .xmp-ipod-split-cover .xmp-ipod-thumb{
  width:100%;max-width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#222;
  box-shadow:0 4px 14px rgba(0,0,0,.4);
}
#xmp-panel .xmp-ipod-split-cover img{width:100%;height:100%;object-fit:cover;display:block;}
#xmp-panel .xmp-ipod-split-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
#xmp-panel .xmp-ipod-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 0;-webkit-overflow-scrolling:touch;}
#xmp-panel .xmp-ipod-item{padding:8px 10px;font-size:13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.06);}
#xmp-panel .xmp-ipod-item.sel{background:#0A84FF;color:#fff;}
#xmp-panel .xmp-ipod-now{display:none;height:100%;}
#xmp-panel .xmp-ipod-now.show{display:flex;}
#xmp-panel .xmp-ipod-now-cover{width:50%;height:100%;flex-shrink:0;overflow:hidden;background:#111;}
#xmp-panel .xmp-ipod-now-cover img{width:100%;height:100%;object-fit:cover;}
#xmp-panel .xmp-ipod-now-ly{width:50%;height:100%;overflow:hidden;font-size:12px;line-height:1.45;color:rgba(255,255,255,.8);padding:10px 8px;box-sizing:border-box;}
#xmp-panel .xmp-ipod-wheel-wrap{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px 0 4px;}
#xmp-panel .xmp-ipod-wheel{
  width:min(86vw,320px);height:min(86vw,320px);border-radius:50%;position:relative;touch-action:none;
  background:radial-gradient(circle at 50% 50%,#3a3a3c 0 26%,#2a2a2c 27% 100%);
  box-shadow:inset 0 2px 4px rgba(255,255,255,.12),inset 0 -3px 8px rgba(0,0,0,.35),0 10px 28px rgba(0,0,0,.28);
  border:3px solid rgba(0,0,0,.12);
}
#xmp-panel .xmp-ipod-center{
  position:absolute;left:50%;top:50%;width:34%;height:34%;transform:translate(-50%,-50%);border-radius:50%;
  background:linear-gradient(160deg,#4a4a4c,#2e2e30);border:none;color:#eee;font-size:11px;font-weight:700;letter-spacing:.04em;
  box-shadow:0 2px 6px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.15);
}
#xmp-panel .xmp-ipod-center:active{filter:brightness(1.2);transform:translate(-50%,-50%) scale(.96);}
#xmp-panel .xmp-ipod-seg{position:absolute;color:rgba(0,0,0,.35);font-size:11px;font-weight:800;pointer-events:none;text-shadow:0 1px 0 rgba(255,255,255,.2);}
#xmp-panel .xmp-ipod-seg.menu{top:11%;left:50%;transform:translateX(-50%);}
#xmp-panel .xmp-ipod-seg.prev{left:9%;top:50%;transform:translateY(-50%);}
#xmp-panel .xmp-ipod-seg.next{right:9%;top:50%;transform:translateY(-50%);}
#xmp-panel .xmp-ipod-seg.play{bottom:11%;left:50%;transform:translateX(-50%);}

#xmp-panel .xmp-ipod-wheel.is-press-menu { transform: scale(0.985); }
#xmp-panel .xmp-ipod-wheel.is-press-prev .xmp-ipod-seg.prev,
#xmp-panel .xmp-ipod-wheel.is-press-next .xmp-ipod-seg.next,
#xmp-panel .xmp-ipod-wheel.is-press-play .xmp-ipod-seg.play,
#xmp-panel .xmp-ipod-wheel.is-press-menu .xmp-ipod-seg.menu {
  color: #fff !important; transform: scale(1.15);
  filter: brightness(1.4);
}
#xmp-panel .xmp-ipod-wheel .xmp-ipod-seg {
  transition: transform .12s ease, color .12s ease, filter .12s ease;
}
#xmp-panel .xmp-ipod-center.is-press {
  transform: translate(-50%,-50%) scale(0.9) !important;
  filter: brightness(1.25);
  transition: transform .1s ease, filter .1s ease;
}
#xmp-panel .xmp-ipod-wheel { transition: transform .12s ease; }

#xmp-panel .xmp-settings-back{
  display:none;align-items:center;gap:6px;border:none;background:rgba(120,120,128,.2);color:var(--fg-1);
  border-radius:16px;padding:8px 14px;font-size:14px;font-weight:600;margin:8px 0 4px;
}
#xmp-panel.ipod-mode .xmp-settings-back,
#xmp-panel[data-home-mode="ipod"] .xmp-settings-back,
#xmp-panel.ipod-mode #xmp-settings-back{display:inline-flex !important;}


#xmp-panel .xmp-pl-card.stats{background:linear-gradient(135deg,rgba(10,132,255,.18),rgba(48,209,88,.1));border-color:rgba(10,132,255,.25);}
#xmp-panel .xmp-pl-add-row{display:flex;gap:8px;margin-top:4px;}
#xmp-panel .xmp-pl-add-row .xmp-footer-btn{flex:1;justify-content:center;}
#xmp-panel .xmp-pl-detail{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
#xmp-panel .xmp-pl-detail-bar{display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 8px;flex-shrink:0;}
#xmp-panel .xmp-pl-detail-back{width:36px;height:36px;border:none;border-radius:50%;background:var(--btn-bg);color:var(--fg-1);display:flex;align-items:center;justify-content:center;cursor:pointer;}
#xmp-panel .xmp-pl-detail-back svg{width:18px;height:18px;}
#xmp-panel .xmp-pl-detail-title{flex:1;font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-playlist-view.list-mode .xmp-pl-detail,
#xmp-panel .xmp-playlist-view.list-mode #xmp-playlist-head-wrap,
#xmp-panel .xmp-playlist-view.list-mode #xmp-playlist-toolbar,
#xmp-panel .xmp-playlist-view.list-mode #xmp-search-wrap,
#xmp-panel .xmp-playlist-view.list-mode #xmp-playlist-list{display:none!important;}
#xmp-panel .xmp-playlist-view.detail-mode .xmp-pl-page{display:none!important;}
#xmp-panel .xmp-playlist-view.detail-mode .xmp-pl-detail{display:flex;}
#xmp-panel .xmp-playlist-view.list-mode .xmp-pl-page{display:flex;}
#xmp-panel .xmp-playlist-view.personal-mode .xmp-pl-page{display:none!important;}
#xmp-panel .xmp-playlist-view.personal-mode .xmp-pl-detail{display:flex;}
#xmp-panel .xmp-playlist-tabs{display:none!important;}
#xmp-panel .xmp-wall-toggle-row{width:100%;margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.28);box-sizing:border-box;}
#xmp-panel .xmp-wall-toggle-label{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--fg-1);cursor:pointer;}
#xmp-panel .xmp-wall-toggle-label input{width:18px;height:18px;accent-color:var(--accent,#0A84FF);}
#xmp-panel .xmp-wall-toggle-hint{margin-top:6px;font-size:11px;color:var(--fg-2);line-height:1.4;}
#xmp-panel .xmp-playlist-head{flex-wrap:wrap;}
#xmp-panel .xmp-wall-viewport.is-dragging .xmp-wall-item{transition:none!important;}
#xmp-panel .xmp-wall-plane{backface-visibility:hidden;}


#xmp-panel .xmp-view-wall{padding-bottom:0 !important;}

/* 页面淡入淡出 */
#xmp-panel .xmp-view{
  will-change: opacity;
  backface-visibility: hidden;
  transition: opacity var(--page-fade, .3s) cubic-bezier(.25,.1,.25,1);
}
#xmp-panel .xmp-view.is-show{ opacity:1; pointer-events:auto; }
#xmp-panel .xmp-view.is-leave{ opacity:0; pointer-events:none; z-index:6; }
#xmp-panel .xmp-view.is-enter{ opacity:0; pointer-events:none; z-index:7; }
#xmp-panel .xmp-nav-btn{ transition: color .2s ease, opacity .2s ease, transform .2s ease; }
#xmp-panel .xmp-nav-btn:active{ transform: scale(.92); }
#xmp-panel{
  --accent: #0A84FF; --accent-2: #5AC8FA; --accent-fg: #ffffff;
  --accent-soft: rgba(10,132,255,.18);
  --grad: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
  --panel-bg: var(--bg-1);
  --nav-bg: rgba(0,0,0,.75);
  --wall-bg: #0a0a0c;
  --card-bg: var(--bg-2);
}
#xmp-panel .xmp-nav-btn.active svg{ stroke: var(--accent-2); }
#xmp-panel .xmp-progress-inner{ background: var(--grad) !important; }
#xmp-panel input[type=range]{ accent-color: var(--accent); }
#xmp-panel .xmp-wall-loading-fill{ background: var(--grad) !important; }
#xmp-panel .xmp-color-swatch.active{ outline: 2px solid var(--accent); outline-offset: 2px; }
#xmp-panel .xmp-tab.active{ color: var(--accent); }
#xmp-panel .xmp-mini-bar.show{ background: var(--card-bg-fill, var(--nav-bg)) !important; border: 1px solid var(--nav-border, transparent); }
#xmp-panel .xmp-pl-card,
#xmp-panel .xmp-setting-row{ background: var(--card-bg, var(--bg-2)); }
#xmp-panel .xmp-view-playlist,
#xmp-panel .xmp-view-settings,
#xmp-panel .xmp-view-add,
#xmp-panel .xmp-view-player{ background: transparent; }
#xmp-fab{ background: var(--grad) !important; }

#xmp-panel .xmp-wall-loading{
  position:absolute; inset:0; z-index:8;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:14px; padding:24px;
  background: rgba(10,10,12,.72);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  color:#fff; text-align:center;
  opacity:0; pointer-events:none;
  transition: opacity .35s cubic-bezier(.32,.72,0,1);
}
#xmp-panel .xmp-wall-loading.show{ opacity:1; pointer-events:auto; }
#xmp-panel .xmp-wall-loading-title{ font-size:15px; font-weight:600; letter-spacing:.02em; }
#xmp-panel .xmp-wall-loading-sub{ font-size:12px; color:rgba(255,255,255,.65); line-height:1.5; }
#xmp-panel .xmp-wall-loading-bar{
  width:min(220px,70%); height:4px; border-radius:4px;
  background:rgba(255,255,255,.12); overflow:hidden; margin-top:4px;
}
#xmp-panel .xmp-wall-loading-fill{
  height:100%; width:0%; border-radius:4px;
  background: linear-gradient(90deg, var(--accent,#0A84FF), #5AC8FA);
  transition: width .25s cubic-bezier(.32,.72,0,1);
}
#xmp-panel .xmp-wall-viewport.is-loading{ touch-action: none; }
#xmp-panel .xmp-pl-page, #xmp-panel .xmp-pl-detail, #xmp-panel .xmp-settings-body{
  transition: opacity .28s cubic-bezier(.32,.72,0,1), transform .32s cubic-bezier(.32,.72,0,1);
}
`);

    /* ============================================================
     *  歌词详情页（Apple Music 风格）
     * ============================================================ */
    GM_addStyle(`
#xmp-panel .xmp-ly{position:absolute;inset:0;z-index:100;display:grid;color:#fff;overflow:hidden;background:#161618;touch-action:pan-y;
 grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr) auto;
 grid-template-areas:"top" "head" "lyrics" "ctrl";
 padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);
 transform:translateY(100%);visibility:hidden;pointer-events:none;
 transition:transform .34s cubic-bezier(.32,.72,0,1),visibility 0s .34s;}
#xmp-panel .xmp-ly.show{transform:none;visibility:visible;pointer-events:auto;transition:transform .34s cubic-bezier(.32,.72,0,1),visibility 0s;}
#xmp-panel .xmp-ly.dragging{transition:none!important;}
#xmp-panel .xmp-ly-bg{position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none;}
#xmp-panel .xmp-ly-bgimg{position:absolute;inset:-25%;background-size:cover;background-position:center;filter:blur(46px) saturate(1.6) brightness(.78);transform:translateZ(0);}
#xmp-panel .xmp-ly-bgdim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.5));}
#xmp-panel .xmp-ly-top{grid-area:top;position:relative;z-index:3;display:flex;align-items:center;padding:10px 14px 0;}
#xmp-panel .xmp-ly-close{width:38px;height:38px;border:none;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#xmp-panel .xmp-ly-close:active{background:rgba(255,255,255,.28);}
#xmp-panel .xmp-ly-close svg{width:22px;height:22px;}
#xmp-panel .xmp-ly-top{justify-content:space-between;gap:8px;}
#xmp-panel .xmp-ly-jizura{
  margin-left:auto; height:32px; padding:0 12px; border:none; border-radius:16px;
  background:rgba(255,255,255,.16); color:#fff; font-size:12px; font-weight:600;
  letter-spacing:.02em; cursor:pointer;
}
#xmp-panel .xmp-ly-jizura:active{background:rgba(255,255,255,.28);}
#xmp-panel .xmp-ly-head{grid-area:head;position:relative;z-index:2;display:flex;align-items:center;gap:12px;padding:10px 20px 4px;min-width:0;}
#xmp-panel .xmp-ly-cover{width:58px;height:58px;border-radius:10px;overflow:hidden;flex:none;background:rgba(255,255,255,.12);box-shadow:0 8px 22px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;transform:scale(.9);transition:transform .55s cubic-bezier(.2,.8,.2,1);}
#xmp-panel .xmp-ly.playing .xmp-ly-cover{transform:scale(1);}
#xmp-panel .xmp-ly-cover img{width:100%;height:100%;object-fit:cover;display:block;}
#xmp-panel .xmp-ly-cover svg{width:40%;height:40%;opacity:.4;}
#xmp-panel .xmp-ly-meta{min-width:0;flex:1;}
#xmp-panel .xmp-ly-title{font-size:17px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xmp-panel .xmp-ly-artist{font-size:14px;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
#xmp-panel .xmp-ly-lyrics{grid-area:lyrics;position:relative;z-index:1;min-height:0;min-width:0;}
#xmp-panel .xmp-ly-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-width:none;
 -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 9%,#000 84%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 9%,#000 84%,transparent 100%);}
#xmp-panel .xmp-ly-scroll::-webkit-scrollbar{display:none;}
#xmp-panel .xmp-ly-lines{position:relative;padding:22vh 22px 55vh 24px;}
#xmp-panel .xmp-ly-line{font-size:clamp(22px,7vw,32px);font-weight:700;line-height:1.32;margin:0 0 .5em -10px;padding:7px 10px;border-radius:14px;
 transform-origin:left center;transform:scale(.93);opacity:.3;filter:blur(1.6px);cursor:pointer;-webkit-tap-highlight-color:transparent;word-break:break-word;
 transition:opacity .45s ease,transform .5s cubic-bezier(.2,.8,.2,1),filter .45s ease;}
#xmp-panel .xmp-ly-line.near{opacity:.45;filter:blur(.8px);}
#xmp-panel .xmp-ly-line.active{opacity:1;transform:scale(1);filter:none;}
#xmp-panel .xmp-ly-line:active{background:rgba(255,255,255,.1);}
#xmp-panel .xmp-ly.free .xmp-ly-line{filter:none;opacity:.62;}
#xmp-panel .xmp-ly.free .xmp-ly-line.active{opacity:1;}
#xmp-panel .xmp-ly-tr{display:block;font-size:.58em;font-weight:600;opacity:.78;margin-top:.28em;line-height:1.35;}
#xmp-panel .xmp-ly-msg{padding:0 4px;font-size:18px;font-weight:600;opacity:.6;}
#xmp-panel .xmp-ly-ctrl{grid-area:ctrl;position:relative;z-index:3;padding:4px 24px 16px;}
#xmp-panel .xmp-ly-prog{height:24px;display:flex;align-items:center;touch-action:none;cursor:pointer;}
#xmp-panel .xmp-ly-bar{flex:1;height:4px;border-radius:4px;background:rgba(255,255,255,.26);overflow:hidden;transition:height .15s;}
#xmp-panel .xmp-ly-prog.drag .xmp-ly-bar{height:9px;}
#xmp-panel .xmp-ly-in{height:100%;width:0;background:#fff;border-radius:4px;}
#xmp-panel .xmp-ly-times{display:flex;justify-content:space-between;font-size:11px;opacity:.6;font-variant-numeric:tabular-nums;}
#xmp-panel .xmp-ly-btns{display:flex;align-items:center;justify-content:center;gap:38px;margin-top:4px;}
#xmp-panel .xmp-ly-btn{width:48px;height:48px;border:none;background:transparent;color:#fff;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;border-radius:50%;-webkit-tap-highlight-color:transparent;}
#xmp-panel .xmp-ly-btn:active{background:rgba(255,255,255,.14);}
#xmp-panel .xmp-ly-btn svg{width:28px;height:28px;}
#xmp-panel .xmp-ly-btn.play{width:64px;height:64px;}
#xmp-panel .xmp-ly-btn.play svg{width:40px;height:40px;}
#xmp-panel .xmp-ly-lyrics{
  transition: transform .48s cubic-bezier(.22,.9,.28,1), border-radius .48s cubic-bezier(.22,.9,.28,1), box-shadow .48s ease, filter .48s ease;
  transform-origin: center center;
  will-change: transform;
}
#xmp-panel .xmp-ly.is-picking .xmp-ly-lyrics{
  transform: scale(.92);
  border-radius: 24px;
  box-shadow: 0 16px 40px rgba(0,0,0,.4);
  filter: brightness(.88);
  overflow: hidden;
}
#xmp-panel .xmp-ly.is-picking{
  /* 允许样式卡片滑出可视区而不被裁切成“消失” */
  overflow: visible;
}
#xmp-panel .xmp-ly.is-picking .xmp-ly-top,
#xmp-panel .xmp-ly.is-picking .xmp-ly-head,
#xmp-panel .xmp-ly.is-picking .xmp-ly-ctrl{
  opacity: .35;
  pointer-events: none;
  transition: opacity .35s ease;
}
#xmp-panel .xmp-ly-picker{
  position:absolute; inset:0; z-index:20; display:none;
  align-items:center; justify-content:flex-start;
  background:rgba(0,0,0,.32); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  touch-action: none; overflow: visible;
}
#xmp-panel .xmp-ly.is-picking .xmp-ly-picker{ display:block; }
#xmp-panel .xmp-ly-picker-track{
  position:absolute; left:0; top:50%;
  display:flex; flex-direction:row; flex-wrap:nowrap;
  gap:14px; padding:0;
  will-change: transform;
  transform: translate3d(0,-50%,0);
  /* 禁止被压缩导致前几张“消失” */
  width: max-content; min-width: max-content;
}
#xmp-panel .xmp-ly-picker-card{
  flex: 0 0 auto; width: 156px; height: 220px;
  box-sizing: border-box;
  border-radius:20px; background:rgba(255,255,255,.1);
  border:2px solid transparent; color:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
  padding:16px;
  transition: transform .24s cubic-bezier(.22,.9,.28,1), border-color .2s, background .2s, opacity .2s;
  transform: scale(.9); opacity:.55;
}
#xmp-panel .xmp-ly-picker-card.on{
  transform: scale(1); opacity:1;
  border-color: rgba(255,255,255,.55);
  background: rgba(255,255,255,.16);
}
#xmp-panel .xmp-ly-picker-card .ico{font-size:34px;line-height:1;}
#xmp-panel .xmp-ly-picker-card .lab{font-size:16px;font-weight:600;}
#xmp-panel .xmp-ly-picker-card .hint{font-size:12px;opacity:.55;text-align:center;line-height:1.4;}
#xmp-panel .xmp-ly-picker-tip{position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:13px;opacity:.7;pointer-events:none;}
#xmp-panel .xmp-ly-picker-trash{
  position:absolute; right:18px; bottom:22px; z-index:22;
  width:48px; height:48px; border:none; border-radius:50%;
  background:rgba(0,0,0,.55); color:#fff; font-size:20px;
  display:none; align-items:center; justify-content:center;
  box-shadow:0 8px 24px rgba(0,0,0,.35); cursor:pointer;
}
#xmp-panel .xmp-ly.is-picking .xmp-ly-picker-trash{ display:flex; }
#xmp-panel .xmp-ly-picker-trash:active{ transform:scale(.94); background:rgba(255,80,80,.45); }
#xmp-panel .xmp-ly-picker-card .del{
  position:absolute; top:10px; right:10px; width:28px; height:28px; border:none;
  border-radius:50%; background:rgba(0,0,0,.35); color:#fff; font-size:16px; line-height:1;
  display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer;
}
#xmp-panel .xmp-ly-restore-sheet{
  position:absolute; inset:0; z-index:25; display:none;
  background:rgba(0,0,0,.55); align-items:flex-end; justify-content:center;
}
#xmp-panel .xmp-ly-restore-sheet.show{ display:flex; }
#xmp-panel .xmp-ly-restore-panel{
  width:100%; max-height:55%; overflow:auto; padding:16px 16px 28px;
  background:rgba(28,28,30,.96); border-radius:18px 18px 0 0; color:#fff;
}
#xmp-panel .xmp-ly-restore-panel h4{ margin:0 0 12px; font-size:15px; font-weight:600; }
#xmp-panel .xmp-ly-restore-item{
  display:flex; align-items:center; gap:12px; padding:12px; margin-bottom:8px;
  border-radius:12px; background:rgba(255,255,255,.08); border:none; width:100%;
  color:#fff; text-align:left; font-size:14px; cursor:pointer;
}
#xmp-panel .xmp-ly-restore-item:active{ background:rgba(255,255,255,.16); }
#xmp-panel .xmp-ly-restore-empty{ opacity:.55; font-size:13px; padding:8px 0 16px; }
#xmp-panel .xmp-ly.chat-mode .xmp-ly-scroll{display:none;}
#xmp-panel .xmp-ly-chat{display:none;position:absolute;inset:0;z-index:1;flex-direction:column;min-height:0;}
#xmp-panel .xmp-ly.chat-mode .xmp-ly-chat{display:flex;}
#xmp-panel .xmp-ly-chat-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:12px 14px 8px;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px;}
#xmp-panel .xmp-ly-bubble{
  max-width:78%; padding:10px 14px; border-radius:18px;
  font-size:15px; font-weight:500; line-height:1.45;
  transform-origin: bottom center;
  transform: scale(1);
  transition: transform .42s cubic-bezier(.34,1.35,.64,1), box-shadow .3s ease;
  word-break: break-word;
}
#xmp-panel .xmp-ly-bubble.them{align-self:flex-start;background:rgba(255,255,255,.14);border-bottom-left-radius:6px;color:#fff;}
#xmp-panel .xmp-ly-bubble.me{align-self:flex-end;background:var(--accent,#0A84FF);border-bottom-right-radius:6px;color:var(--accent-fg,#fff);}
#xmp-panel .xmp-ly-bubble.is-active{
  transform: scale(var(--ly-chat-scale, 1.1));
  box-shadow: 0 8px 28px rgba(0,0,0,.28);
  z-index: 2;
}
#xmp-panel .xmp-ly-bubble .ch{
  display:inline-block; transition: transform .18s cubic-bezier(.34,1.4,.64,1), opacity .18s ease;
  transform: scale(1); opacity: .45;
}
#xmp-panel .xmp-ly-bubble .ch.on{ transform: scale(1.12); opacity: 1; }
#xmp-panel .xmp-ly-bubble .ch.done{ transform: scale(1); opacity: 1; }
#xmp-panel .xmp-ly-bubble .tr{display:block;font-size:.72em;opacity:.75;margin-top:4px;font-weight:400;}
#xmp-panel .xmp-ly-composer{flex:none;display:flex;align-items:flex-end;gap:8px;padding:8px 12px 10px;background:rgba(0,0,0,.25);border-top:1px solid rgba(255,255,255,.08);}
#xmp-panel .xmp-ly-composer-box{flex:1;min-height:36px;max-height:72px;overflow:hidden;border-radius:18px;background:rgba(255,255,255,.12);padding:9px 14px;font-size:14px;line-height:1.4;color:#fff;white-space:pre-wrap;word-break:break-word;}
#xmp-panel .xmp-ly-composer-box .caret{display:inline-block;width:2px;height:1em;margin-left:1px;background:rgba(255,255,255,.85);vertical-align:text-bottom;animation:xmpLyCaret .9s steps(1) infinite;}
@keyframes xmpLyCaret{0%,50%{opacity:1}51%,100%{opacity:0}}
#xmp-panel .xmp-ly-composer-send{width:36px;height:36px;border:none;border-radius:50%;background:var(--accent,#0A84FF);color:#fff;flex:none;display:flex;align-items:center;justify-content:center;opacity:.45;pointer-events:none;}
#xmp-panel .xmp-ly-composer-send.ready{opacity:1;}

/* ---- 歌词 PV 舞台（Canvas 分镜） ---- */
#xmp-panel .xmp-ly-pv{
  display:none; position:absolute; inset:0; z-index:1;
  overflow:hidden; pointer-events:none;
}
#xmp-panel .xmp-ly.pv-mode .xmp-ly-scroll{ display:none; }
#xmp-panel .xmp-ly.pv-mode .xmp-ly-chat{ display:none; }
#xmp-panel .xmp-ly.pv-mode .xmp-ly-pv{ display:block; }
#xmp-panel .xmp-ly-pv{
  position:absolute !important; inset:0 !important; width:100% !important; height:100% !important;
  z-index:2; overflow:hidden; background:#000;
}
#xmp-panel .xmp-ly-pv canvas,
#xmp-panel .xmp-ly-pv .xmp-jizura-cv,
#xmp-panel .xmp-ly-pv .xmp-folia-cv{
  position:absolute; inset:0; width:100%; height:100%;
  display:block; z-index:1;
}
/* 切走 JIZURA 后确保宿主不挡其它样式 */
#xmp-panel .xmp-ly:not(.pv-mode) .xmp-ly-pv{
  display:none !important; pointer-events:none !important;
}
/* 横屏：仅经典滚动左右分栏；其余样式全屏效果并隐藏封面/进度/按钮 */
@media (orientation: landscape) {
  #xmp-panel .xmp-ly.ly-scroll-land{
    grid-template-columns: minmax(0,42%) minmax(0,1fr) !important;
    grid-template-rows: auto minmax(0,1fr) auto !important;
    grid-template-areas: "top lyrics" "head lyrics" "ctrl lyrics" !important;
  }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-top{ padding: 8px 14px 0; }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-head{
    flex-direction: column; justify-content: center; align-items: flex-start;
    gap: 10px; padding: 0 26px;
  }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-cover{
    width: clamp(96px, calc(100vh - 250px), 100%); height: auto; aspect-ratio: 1;
    max-width: 280px; border-radius: 14px; transform: scale(.92);
  }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-meta{ width: 100%; flex: none; }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-title{ font-size: 19px; }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-lines{ padding: 30vh 30px 50vh 14px; }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-line{ font-size: clamp(20px, 5.6vh, 34px); }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-ctrl{ padding: 0 26px 10px; }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-btn{ width: 42px; height: 42px; }
  #xmp-panel .xmp-ly.ly-scroll-land .xmp-ly-btn.play{ width: 54px; height: 54px; }

  #xmp-panel .xmp-ly.ly-immersive-land{
    grid-template-columns: minmax(0,1fr) !important;
    grid-template-rows: 44px minmax(0,1fr) 0 !important;
    grid-template-areas: "top" "lyrics" "ctrl" !important;
  }
  #xmp-panel .xmp-ly.ly-immersive-land .xmp-ly-head{ display: none !important; }
  #xmp-panel .xmp-ly.ly-immersive-land .xmp-ly-ctrl{ display: none !important; }
  #xmp-panel .xmp-ly.ly-immersive-land .xmp-ly-top{
    background: linear-gradient(180deg, rgba(0,0,0,.5), transparent);
  }
}
/* 仅 JIZURA：整屏铺满 PV，隐藏封面/进度/按钮；顶栏悬浮可关 */
#xmp-panel .xmp-ly.ly-jizura{
  grid-template-columns: minmax(0,1fr) !important;
  grid-template-rows: 0 1fr 0 !important;
  grid-template-areas: "top" "lyrics" "ctrl" !important;
  background: #000 !important;
  padding: 0 !important; /* 去掉安全区 padding，否则 PV 竖屏顶部/横屏左侧被挖掉一块 */
}
#xmp-panel .xmp-ly.ly-jizura .xmp-ly-head{ display:none !important; }
#xmp-panel .xmp-ly.ly-jizura .xmp-ly-ctrl{ display:none !important; }
#xmp-panel .xmp-ly.ly-jizura .xmp-ly-bg{ display:none !important; }
#xmp-panel .xmp-ly.ly-jizura .xmp-ly-lyrics{
  grid-area:auto !important; /* 绝对定位的 grid 子项会以网格区域为包含块，必须取消，才能真正 inset:0 */
  position:absolute !important; inset:0 !important;
  width:100% !important; height:100% !important;
  z-index:1 !important;
}
#xmp-panel .xmp-ly.ly-jizura .xmp-ly-pv{
  display:block !important;
  position:absolute !important; inset:0 !important;
  width:100% !important; height:100% !important;
  z-index:2 !important; background:#000;
}
#xmp-panel .xmp-ly.ly-jizura .xmp-ly-top{
  position:absolute !important; top:0; left:0; right:0;
  z-index:6; grid-area:auto !important;
  background: linear-gradient(180deg, rgba(0,0,0,.55), transparent);
  padding-top: max(8px, env(safe-area-inset-top, 0px));
  padding-left: max(14px, env(safe-area-inset-left, 0px));
  padding-right: max(14px, env(safe-area-inset-right, 0px));
}
/* 非 JIZURA 的 PV：不要强制黑底全屏 */
#xmp-panel .xmp-ly.pv-mode:not(.ly-jizura) .xmp-ly-pv{
  background: transparent;
}
#xmp-panel .xmp-ly.pv-mode:not(.ly-jizura) .xmp-ly-bg{ display:block; }
`);

    let lyEl = null, lyOpen = false, lyRaf = 0, lyTween = 0;
    let lyLines = [], lyIdx = -1, lyTrackId = null, lyLoadSeq = 0;
    let lyUserScroll = false, lyUserTimer = 0, lyDragging = false, lyHistPushed = false, lySecKey = '';
    let lyPickMode = false, lyPickIdx = 0, lyPickOffset = 0, lyPickVel = 0, lyPickRaf = 0;
    let lyChatSent = -1, lyTypeTimer = 0, lyTypeText = '', lyTypePos = 0;
    const LY_STYLES_ALL = [
        { id: 'scroll', lab: '经典滚动', ico: '≡', hint: '大字居中滚动' },
        { id: 'chat', lab: '对话框', ico: '💬', hint: '短信对话逐句发送' },
        { id: 'pv-kinetic', lab: '动能中央', ico: '◎', hint: '弹入·描线·离场' },
        { id: 'pv-cascade', lab: '级联浪潮', ico: '〰', hint: '逐字错落·波浪' },
        { id: 'pv-mixed', lab: '大小混排', ico: '◈', hint: '主次字号·阶梯' },
        { id: 'pv-vertical', lab: '竖排分镜', ico: 'Ⅲ', hint: '纵写·侧栏残影' },
        { id: 'pv-band', lab: '色带揭示', ico: '▭', hint: '横向擦除揭示' },
        { id: 'pv-noir', lab: '诺尔剪辑', ico: '◼', hint: '暗场·裁切·模糊' },
        { id: 'pv-pulse', lab: '节拍脉冲', ico: '◈', hint: '级联·脉冲保持' },
        { id: 'pv-sphere', lab: '球形条带', ico: '◯', hint: '3D弧带·共球心' },
        { id: 'jizura', lab: 'JIZURA PV', ico: '字', hint: '离线引擎·跟进度播放' },
        { id: 'folia', lab: 'Folia 风', ico: '✦', hint: '光韵·云阶·绘光·烟岚' }
    ];
    function lyHiddenIds() {
        const h = settings.lyricHiddenStyles;
        return Array.isArray(h) ? h.map(String) : [];
    }
    function lyVisibleStyles() {
        const hid = new Set(lyHiddenIds());
        const list = LY_STYLES_ALL.filter(s => !hid.has(s.id));
        return list.length ? list : LY_STYLES_ALL.slice(0, 1);
    }
    const LY_STYLES = LY_STYLES_ALL;
    const lyMem = new Map();
    const LY_PREFIX = 'xny_lyric_v1_';
    const LY_MAP_PREFIX = 'xny_lyric_map_v1_';

    /*LY-PURE-START*/
    function lyParseLrc(text) {
        const out = [];
        if (!text) return out;
        const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
        for (const raw of String(text).split(/\r?\n/)) {
            if (/^\s*\{/.test(raw)) continue;               // 网易云的 JSON 制作信息行
            re.lastIndex = 0;
            const stamps = [];
            let m;
            while ((m = re.exec(raw))) {
                stamps.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0));
            }
            if (!stamps.length) continue;
            const txt = raw.replace(re, '').trim();
            if (!txt) continue;
            for (const t of stamps) out.push({ t, text: txt });
        }
        out.sort((a, b) => a.t - b.t);
        return out;
    }
    function lyBuild(lrc, tlrc) {
        let lines = lyParseLrc(lrc);
        // 去掉开头的「作词/作曲」等制作信息
        while (lines.length && lines[0].t < 30 && /^(作词|作曲|编曲|制作人?|混音|母带|录音|监制|词|曲)\s*[:：]/.test(lines[0].text)) lines.shift();
        const tl = lyParseLrc(tlrc);
        if (tl.length) {
            let j = 0;
            for (const l of lines) {
                while (j < tl.length - 1 && tl[j].t < l.t - 0.35) j++;
                if (Math.abs(tl[j].t - l.t) < 0.35 && tl[j].text !== l.text) l.tr = tl[j].text;
            }
        }
        return lines;
    }
    function lyFindIndex(lines, t) {
        let lo = 0, hi = lines.length - 1, r = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lines[mid].t <= t) { r = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return r;
    }
    /** 与 lyTick 相同的时间基：audio.currentTime + 0.15 */
    function lyMediaTime() {
        const ct = (audio && isFinite(audio.currentTime)) ? audio.currentTime : 0;
        return Math.max(0, ct + 0.15);
    }
    /** 按当前播放进度强制对齐歌词索引/滚动/当前样式画面 */
    function lySyncToAudio() {
        if (!lyEl || !lyLines.length) return;
        const t = lyMediaTime();
        const r = lyFindIndex(lyLines, t);
        lyUserScroll = false;
        try { lyEl.classList.remove('free'); } catch (e) {}
        // 强制走一遍激活，即使索引相同也要刷新滚动样式
        const prev = lyIdx;
        lyIdx = -999;
        lySetActive(r);
        if (r < 0 && prev >= 0) lyIdx = -1;
        const st = settings.lyricStyle || 'scroll';
        if (st === 'jizura') {
            try { lyJizuraEnsureAndDraw(audio ? audio.currentTime : 0); } catch (e) {}
        } else if (st === 'folia') {
            try { lyFoliaEnsureAndDraw(audio ? audio.currentTime : 0); } catch (e) {}
        } else if (lyIsPvStyle(st) && r >= 0) {
            try { lyPvOnActive(r); } catch (e) {}
        }
        if (st === 'scroll' || (!lyIsPvStyle(st) && st !== 'chat' && st !== 'jizura' && st !== 'folia')) {
            try { lyScrollToActive(); } catch (e) {}
        }
    }
    function lyCleanTitle(t) {
        let s = String(t || '');
        const book = s.match(/《([^》]+)》/);
        if (book) s = book[1];
        s = s.replace(/[【\[（(][^】\]）)]*[】\]）)]/g, ' ')
            .replace(/\b(official|mv|hd|4k|lyrics?|audio|video|music video)\b/ig, ' ')
            .replace(/(高清|无损|完整版|歌词版|官方版|现场版)/g, ' ')
            .replace(/[-–—_|]/g, ' ')
            .replace(/\s+/g, ' ').trim();
        return s;
    }
    function lyNorm(s) { return String(s || '').toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, ''); }
    /*LY-PURE-END*/

    function lyHttp(method, url, data) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Referer': 'https://music.163.com/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
            };
            if (data) headers['Content-Type'] = 'application/x-www-form-urlencoded';
            GM_xmlhttpRequest({
                method, url, headers, data: data || '', timeout: 15000,
                onload: (r) => {
                    if (r.status && (r.status < 200 || r.status >= 400)) return;   // 交给 onerror
                    try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); }
                },
                onerror: () => reject(new Error('network')),
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    function lySized(src, px) { return sizedCoverUrl(src, px); }

    async function lyFindSongId(tr) {
        const mapKey = LY_MAP_PREFIX + tr.id;
        try { const m = await GM_getValue(mapKey, null); if (m) return m === '0' ? '' : String(m); } catch (e) { }
        const full = tr.customTitle || tr.title || '';
        const title = lyCleanTitle(full);
        if (!title) return '';
        const j = await lyHttp('POST', 'https://music.163.com/api/search/get/web',
            's=' + encodeURIComponent(title) + '&type=1&offset=0&total=true&limit=8');
        const songs = (j && j.result && j.result.songs) || [];
        const nt = lyNorm(full);
        const dur = audio && isFinite(audio.duration) ? audio.duration : 0;
        let best = null, bestScore = 0;
        for (const sg of songs) {
            let sc = 0;
            const nn = lyNorm(sg.name);
            if (nn && nt.indexOf(nn) >= 0) sc += 3;
            const arts = (sg.artists || sg.ar || []).map(a => lyNorm(a.name)).filter(Boolean);
            if (arts.some(a => nt.indexOf(a) >= 0)) sc += 2;
            const d = (sg.duration || sg.dt || 0) / 1000;
            if (dur && d && Math.abs(d - dur) < 6) sc += 2;
            if (sc > bestScore) { bestScore = sc; best = sg; }
        }
        if (best && bestScore >= 3) {
            try { GM_setValue(mapKey, String(best.id)); } catch (e) { }
            return String(best.id);
        }
        return '';
    }

    async function lyFetchForTrack(tr) {
        let sid = (tr.type === 'netease' && tr.neteaseId) ? String(tr.neteaseId) : '';
        if (!sid) sid = await lyFindSongId(tr);
        if (!sid) return { none: true };
        if (lyMem.has(sid)) return lyMem.get(sid);
        let compact = null;
        try {
            const raw = await GM_getValue(LY_PREFIX + sid, null);
            if (raw) compact = JSON.parse(raw);
        } catch (e) { }
        if (!compact) {
            const j = await lyHttp('GET', 'https://music.163.com/api/song/lyric?id=' + sid + '&lv=-1&kv=-1&tv=-1');
            compact = {
                l: (j && j.lrc && j.lrc.lyric) || '',
                t: (j && j.tlyric && j.tlyric.lyric) || '',
                n: !!(j && j.nolyric)
            };
            if (compact.l || compact.n) { try { GM_setValue(LY_PREFIX + sid, JSON.stringify(compact)); } catch (e) { } }
        }
        const res = { lines: lyBuild(compact.l, compact.t), instrumental: !!compact.n };
        lyMem.set(sid, res);
        return res;
    }

    function lyIsPvStyle(st) {
        st = st || settings.lyricStyle || 'scroll';
        return String(st).indexOf('pv-') === 0 || st === 'jizura' || st === 'folia';
    }
    function lyUpdateLandscapeClass() {
        if (!lyEl) return;
        const land = (window.innerWidth > window.innerHeight) ||
            (window.matchMedia && window.matchMedia('(orientation: landscape)').matches);
        const st = settings.lyricStyle || 'scroll';
        lyEl.classList.toggle('ly-landscape', !!land);
        lyEl.classList.toggle('ly-scroll-land', !!land && st === 'scroll');
        // 仅 JIZURA：横/竖都沉浸全屏；其它样式保持普通布局（模糊封面）
        lyEl.classList.toggle('ly-immersive-land', false);
        lyEl.classList.toggle('ly-jizura', st === 'jizura' || st === 'folia');
    }
    function lyLeaveJizuraSurface() {
        try { if (window.XmpJizuraPlayer) window.XmpJizuraPlayer.dispose(); } catch (e) {}
        if (lyEl) {
            const host = lyEl.querySelector('.xmp-ly-pv');
            if (host) {
                try { host.querySelectorAll('.xmp-jizura-cv').forEach(n => n.remove()); } catch (e) {}
                host.style.display = '';
            }
        }
    }
    function lyApplyStyleClass() {
        if (!lyEl) return;
        const st = settings.lyricStyle || 'scroll';
        const wasJizura = lyEl.dataset.ly === 'jizura';
        const wasFolia = lyEl.dataset.ly === 'folia';
        lyEl.classList.toggle('chat-mode', st === 'chat');
        lyEl.classList.toggle('pv-mode', lyIsPvStyle(st));
        lyEl.dataset.ly = st;
        lyUpdateLandscapeClass();
        if (st !== 'jizura' && wasJizura) {
            lyLeaveJizuraSurface();
            requestAnimationFrame(() => lySyncToAudio());
        }
        if (st !== 'folia' && wasFolia) {
            lyLeaveFoliaSurface();
            requestAnimationFrame(() => lySyncToAudio());
        }
        if (st === 'jizura') {
            lyLeaveFoliaSurface();
            lyJizuraBoot();
        } else if (st === 'folia') {
            lyLeaveJizuraSurface();
            lyFoliaBoot();
        } else if (String(st).indexOf('pv-') === 0) {
            const host = lyEl.querySelector('.xmp-ly-pv');
            if (host) {
                try { host.querySelectorAll('.xmp-jizura-cv,.xmp-folia-cv').forEach(n => n.remove()); } catch (e) {}
            }
        }
    }
    function lyRender(lines, msg) {
        if (!lyEl) return;
        lyApplyStyleClass();
        const box = lyEl.querySelector('.xmp-ly-lines');
        const chatList = lyEl.querySelector('.xmp-ly-chat-list');
        const composer = lyEl.querySelector('.xmp-ly-composer-box');
        lyEl.querySelector('.xmp-ly-scroll').scrollTop = 0;
        lyChatSent = -1;
        clearTimeout(lyTypeTimer);
        lyTypeText = ''; lyTypePos = 0;
        if (composer) composer.innerHTML = '';
        if (!lines.length) {
            box.innerHTML = '<div class="xmp-ly-msg">' + escHtml(msg || '') + '</div>';
            if (chatList) chatList.innerHTML = '<div class="xmp-ly-msg" style="text-align:center;padding:40px 12px;">' + escHtml(msg || '') + '</div>';
            return;
        }
        box.innerHTML = lines.map((l, i) =>
            '<div class="xmp-ly-line" data-i="' + i + '">' + escHtml(l.text) +
            (l.tr ? '<span class="xmp-ly-tr">' + escHtml(l.tr) + '</span>' : '') + '</div>').join('');
        if (chatList) chatList.innerHTML = '';
        lyPvShot = null;
        if (lyPvCtx && lyPvCanvas) {
            try { lyPvCtx.clearRect(0, 0, lyPvCanvas.width, lyPvCanvas.height); } catch (_) {}
        }
        if ((settings.lyricStyle || '') === 'folia') {
            try { lyFoliaBoot(); } catch (e) {}
        }
    }

    async function lyLoad(tr) {
        const seq = ++lyLoadSeq;
        lyTrackId = tr.id; lyLines = []; lyIdx = -1;
        lyRender([], '歌词加载中…');
        try {
            const d = await lyFetchForTrack(tr);
            if (seq !== lyLoadSeq) return;
            if (d.lines && d.lines.length) { lyLines = d.lines; lyRender(lyLines); lyIdx = -2; }
            else lyRender([], d.instrumental ? '纯音乐，请欣赏' : '暂无歌词');
        } catch (e) {
            if (seq !== lyLoadSeq) return;
            lyRender([], '歌词获取失败，请检查网络');
            console.warn('[lyric]', e);
        }
    }


    function lySetActive(idx) {
        lyIdx = idx;
        const st = settings.lyricStyle || 'scroll';
        if (st === 'chat') { lyChatOnActive(idx); return; }
        if (st === 'jizura') {
            if (!window.XmpJizuraPlayer || !window.XmpJizuraPlayer.isReady()) {
                loadJizuraEngine().then(() => {
                    try {
                        if (!window.XmpJizuraPlayer.getPlan())
                            window.XmpJizuraPlayer.bake(Object.assign(lyJizuraBakeOpts(), { force: true }));
                        lyJizuraEnsureAndDraw(audio ? audio.currentTime : 0);
                    } catch (e) { console.warn(e); }
                }).catch(e => showToast(String(e.message || e)));
            }
            return;
        }
        if (st === 'folia') {
            if (!window.XmpFoliaPlayer || !window.XmpFoliaPlayer.isReady()) {
                loadFoliaEngine().then(() => {
                    try { lyFoliaEnsureAndDraw(audio ? audio.currentTime : 0); } catch (e) { console.warn(e); }
                }).catch(e => showToast(String(e.message || e)));
            }
            return;
        }
        if (lyIsPvStyle(st)) { lyPvOnActive(idx); return; }
        const box = lyEl.querySelector('.xmp-ly-lines');
        if (!box) return;
        const nodes = box.children;
        for (let i = 0; i < nodes.length; i++) {
            const d = i - idx;
            nodes[i].className = 'xmp-ly-line' + (d === 0 ? ' active' : (d === 1 || d === -1 ? ' near' : ''));
        }
        if (!lyUserScroll) lyScrollToActive();
    }

    /* ========== 应用内歌词运动引擎（自动预设，无需 JIZURA 网页） ========== */
    let lyPvCanvas = null, lyPvCtx = null, lyPvShot = null;

    function lyEaseOutCubic(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
    function lyEaseInCubic(t) { t = Math.max(0, Math.min(1, t)); return t * t * t; }
    function lyEaseOutBack(t) { t = Math.max(0, Math.min(1, t)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    function lyEaseOutExpo(t) { t = Math.max(0, Math.min(1, t)); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
    function lyHash(a, b, c) {
        let x = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 144729091)) >>> 0;
        x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
        return (x >>> 0) / 4294967296;
    }

    const LY_PV_PRESETS = {
        'pv-kinetic': { lab: '动能中央', layout: 'center', enter: 'pop', hold: 'breathe', exit: 'rise', underline: true, accentFlash: false },
        'pv-cascade': { lab: '级联浪潮', layout: 'cascade', enter: 'riseStagger', hold: 'wave', exit: 'fadeUp', underline: false, accentFlash: true },
        'pv-mixed': { lab: '大小混排', layout: 'mixed', enter: 'spinIn', hold: 'drift', exit: 'scatter', underline: false, accentFlash: true },
        'pv-vertical': { lab: '竖排分镜', layout: 'vertical', enter: 'slideY', hold: 'still', exit: 'slideX', underline: false, accentFlash: true },
        'pv-band': { lab: '色带揭示', layout: 'band', enter: 'wipe', hold: 'still', exit: 'fade', underline: false, accentFlash: false },
        'pv-noir': { lab: '诺尔剪辑', layout: 'center', enter: 'clipReveal', hold: 'tilt', exit: 'blurOut', underline: true, accentFlash: false, dimBg: true },
        'pv-pulse': { lab: '节拍脉冲', layout: 'cascade', enter: 'pop', hold: 'pulse', exit: 'rise', underline: false, accentFlash: true },
        'pv-sphere': { lab: '球形条带', layout: 'sphere', enter: 'sphere', hold: 'sphere', exit: 'sphere', underline: false, accentFlash: false }
    };

    function lyPvEnsure() {
        if (!lyEl) return null;
        const host = lyEl.querySelector('.xmp-ly-pv');
        if (!host) return null;
        if (!lyPvCanvas) {
            lyPvCanvas = document.createElement('canvas');
            host.appendChild(lyPvCanvas);
            lyPvCtx = lyPvCanvas.getContext('2d');
        } else if (!lyPvCanvas.isConnected || lyPvCanvas.parentNode !== host) {
            host.appendChild(lyPvCanvas); // 曾被 JIZURA 清场摘掉，重新挂回
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = host.clientWidth || 360, h = host.clientHeight || 400;
        if (lyPvCanvas._w !== w || lyPvCanvas._h !== h) {
            lyPvCanvas.width = Math.round(w * dpr);
            lyPvCanvas.height = Math.round(h * dpr);
            lyPvCanvas.style.width = w + 'px';
            lyPvCanvas.style.height = h + 'px';
            lyPvCanvas._w = w; lyPvCanvas._h = h;
            lyPvCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        return { ctx: lyPvCtx, W: w, H: h };
    }

    function lyPvFitFont(ctx, text, maxW, maxPx, minPx, weight) {
        let lo = minPx || 16, hi = maxPx || 48, best = lo;
        const wt = weight || 700;
        while (lo <= hi) {
            const m = (lo + hi) >> 1;
            ctx.font = wt + ' ' + m + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            if (ctx.measureText(text).width <= maxW) { best = m; lo = m + 1; }
            else hi = m - 1;
        }
        return best;
    }

    function lyPvBuildShot(idx) {
        const sk = (currentTrack && (currentTrack.id || currentTrack.title)) || '';
        if (lySphereTrackSong && sk && String(lySphereTrackSong) !== String(sk)) {
            lySphereTracks = null; lySphereTrackSong = null;
        }
        if (idx < 0 || !lyLines[idx]) { lyPvShot = null; return; }
        const L = lyLines[idx];
        const next = lyLines[idx + 1];
        const t0 = L.t;
        const t1 = next ? next.t : (t0 + 4);
        const dur = Math.max(0.55, t1 - t0);
        const inDur = Math.min(0.5, Math.max(0.18, dur * 0.3));
        const outDur = Math.min(0.42, Math.max(0.16, dur * 0.24));
        const text = String(L.text || '');
        const chars = Array.from(text);
        const styleId = settings.lyricStyle || 'pv-kinetic';
        const preset = LY_PV_PRESETS[styleId] || LY_PV_PRESETS['pv-kinetic'];
        const seed = ((idx + 1) * 9973) ^ (text.length * 131) ^ ((currentTrack && currentTrack.id) ? String(currentTrack.id).length * 17 : 0);
        const varEnter = lyHash(seed, 1, 3) > 0.72 ? 'pop' : preset.enter;
        const varHold = lyHash(seed, 2, 5) > 0.8 ? 'breathe' : preset.hold;
        lyPvShot = {
            idx, text, chars, tr: L.tr || '', t0, t1, dur, inDur, outDur, seed, styleId, preset,
            plan: {
                layout: preset.layout, enter: varEnter, hold: varHold, exit: preset.exit,
                underline: !!preset.underline, accentFlash: !!preset.accentFlash, dimBg: !!preset.dimBg
            }
        };
    }

    function lyPvOnActive(idx) {
        lyPvBuildShot(idx);
        lyPvDraw(audio ? (audio.currentTime || 0) : 0);
    }

    function lyPvEnterFactor(kind, pIn, i, n) {
        const stagger = (i / Math.max(1, n - 1 || 1)) * 0.45;
        const lp = Math.max(0, Math.min(1, (pIn - stagger) / Math.max(0.01, 1 - stagger * 0.5)));
        if (kind === 'pop') return lyEaseOutBack(lp);
        if (kind === 'riseStagger' || kind === 'spinIn' || kind === 'clipReveal') return lyEaseOutCubic(lp);
        if (kind === 'slideY') return lyEaseOutExpo(lp);
        if (kind === 'wipe') return lyEaseOutCubic(pIn);
        return lyEaseOutCubic(lp);
    }

    function lyPvHoldOffset(kind, hold, i, size) {
        if (kind === 'breathe') return { dy: Math.sin(hold * Math.PI * 2) * size * 0.03, sc: 1 + Math.sin(hold * Math.PI * 2) * 0.02 };
        if (kind === 'wave') return { dy: Math.sin(hold * Math.PI * 2 + i * 0.5) * size * 0.05, sc: 1 };
        if (kind === 'drift') return { dy: Math.sin(hold * Math.PI + i) * size * 0.03, dx: Math.cos(hold * Math.PI * 0.7 + i) * size * 0.02, sc: 1 };
        if (kind === 'pulse') return { sc: 1 + Math.sin(hold * Math.PI * 4) * 0.04, dy: 0 };
        if (kind === 'tilt') return { rot: Math.sin(hold * Math.PI * 2) * 0.03, sc: 1 };
        return { sc: 1, dy: 0 };
    }

    function lyPvDraw(ct) {
        const env = lyPvEnsure();
        if (!env || !lyPvShot) return;
        const { ctx, W, H } = env;
        const S = lyPvShot;
        const local = ct - S.t0;
        const pIn = lyEaseOutCubic(Math.max(0, Math.min(1, local / S.inDur)));
        const outStart = S.dur - S.outDur;
        const pOut = local > outStart ? lyEaseInCubic(Math.max(0, Math.min(1, (local - outStart) / S.outDur))) : 0;
        const holdT = Math.max(0, local - S.inDur);
        const holdDur = Math.max(0.01, S.dur - S.inDur - S.outDur);
        const hold = Math.max(0, Math.min(1, holdT / holdDur));
        const accent = (panel && getComputedStyle(panel).getPropertyValue('--accent').trim()) || '#0A84FF';
        ctx.clearRect(0, 0, W, H);
        if (S.plan.dimBg) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, H); }
        ctx.save();
        const L = S.plan.layout;
        if (L === 'cascade') lyPvDrawCascade(ctx, W, H, S, pIn, pOut, hold, accent);
        else if (L === 'mixed') lyPvDrawMixed(ctx, W, H, S, pIn, pOut, hold, accent);
        else if (L === 'vertical') lyPvDrawVertical(ctx, W, H, S, pIn, pOut, hold, accent);
        else if (L === 'band') lyPvDrawBand(ctx, W, H, S, pIn, pOut, hold, accent);
        else if (L === 'sphere') lyPvDrawSphere(ctx, W, H, S, pIn, pOut, hold, accent, ct);
        else lyPvDrawCenter(ctx, W, H, S, pIn, pOut, hold, accent);
        ctx.restore();
    }

    function lyPvDrawCenter(ctx, W, H, S, pIn, pOut, hold, accent) {
        const size = lyPvFitFont(ctx, S.text, W * 0.86, Math.min(H * 0.15, 52), 18, 700);
        const e = lyPvEnterFactor(S.plan.enter, pIn, 0, 1);
        const ho = lyPvHoldOffset(S.plan.hold, hold, 0, size);
        let sc = e * (1 - pOut * 0.12) * (ho.sc || 1);
        const alpha = Math.max(0, e * (1 - pOut));
        let y = H * 0.48 + (1 - e) * size * 0.8 + (ho.dy || 0);
        if (S.plan.exit === 'rise') y -= pOut * size * 0.9;
        ctx.save();
        ctx.translate(W / 2 + (ho.dx || 0), y);
        ctx.rotate(ho.rot || 0);
        ctx.scale(sc, sc);
        ctx.globalAlpha = alpha;
        if (S.plan.exit === 'blurOut' && pOut > 0) ctx.filter = 'blur(' + (pOut * 5).toFixed(1) + 'px)';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = 22;
        ctx.fillText(S.text, 0, 0);
        ctx.filter = 'none';
        if (S.plan.underline && pIn > 0.25 && pOut < 0.8) {
            const tw = ctx.measureText(S.text).width;
            const u = Math.min(1, (pIn - 0.25) / 0.45) * (1 - pOut);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = accent;
            ctx.lineWidth = Math.max(2, size * 0.035);
            ctx.beginPath();
            ctx.moveTo(-tw / 2, size * 0.62);
            ctx.lineTo(-tw / 2 + tw * u, size * 0.62);
            ctx.stroke();
        }
        if (S.tr) {
            ctx.font = '500 ' + Math.max(12, size * 0.4) + 'px system-ui,-apple-system,sans-serif';
            ctx.globalAlpha = alpha * 0.72;
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,.88)';
            ctx.fillText(S.tr, 0, size * 0.95);
        }
        ctx.restore();
    }

    function lyPvDrawCascade(ctx, W, H, S, pIn, pOut, hold, accent) {
        const chars = S.chars;
        const n = chars.length || 1;
        const size = lyPvFitFont(ctx, S.text, W * 0.92, Math.min(H * 0.12, 42), 16, 700);
        ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
        const gaps = chars.map(ch => ctx.measureText(ch).width);
        const total = gaps.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * size * 0.02;
        let x0 = (W - total) / 2;
        const yBase = H * 0.48;
        const active = Math.floor(hold * n) % n;
        chars.forEach((ch, i) => {
            const e = lyPvEnterFactor(S.plan.enter, pIn, i, n);
            const ho = lyPvHoldOffset(S.plan.hold, hold, i, size);
            const alpha = e * (1 - pOut);
            let y = yBase + (1 - e) * size * 0.7 + (ho.dy || 0);
            if (S.plan.exit === 'fadeUp' || S.plan.exit === 'rise') y -= pOut * size * 0.55;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x0 + gaps[i] / 2, y);
            ctx.scale(ho.sc || 1, ho.sc || 1);
            ctx.fillStyle = (S.plan.accentFlash && i === active) ? accent : '#fff';
            ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,.4)';
            ctx.shadowBlur = 14;
            ctx.fillText(ch, 0, 0);
            ctx.restore();
            x0 += gaps[i] + size * 0.02;
        });
    }

    function lyPvDrawMixed(ctx, W, H, S, pIn, pOut, hold, accent) {
        const chars = S.chars.filter(c => c.trim());
        const n = chars.length || 1;
        const base = Math.min(H * 0.1, 40);
        const weights = chars.map((_, i) => (lyHash(S.seed, i, 9) > 0.55 ? 1.28 : (lyHash(S.seed, i, 8) > 0.4 ? 0.82 : 1)));
        const widths = chars.map((ch, i) => {
            ctx.font = '700 ' + (base * weights[i]) + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            return ctx.measureText(ch).width;
        });
        const total = widths.reduce((a, b) => a + b, 0) + n * base * 0.04;
        let x = (W - total) / 2;
        const y0 = H * 0.48;
        chars.forEach((ch, i) => {
            const e = lyPvEnterFactor(S.plan.enter, pIn, i, n);
            const size = base * weights[i];
            const stair = (i - (n - 1) / 2) * base * 0.11;
            const rot = ((i % 2) ? -1 : 1) * (1 - e) * 0.18;
            let scatterX = 0, scatterY = 0;
            if (S.plan.exit === 'scatter') {
                scatterX = (lyHash(S.seed, i, 11) - 0.5) * pOut * 40;
                scatterY = (lyHash(S.seed, i, 12) - 0.3) * pOut * 50;
            }
            ctx.save();
            ctx.globalAlpha = e * (1 - pOut);
            ctx.translate(x + widths[i] / 2 + scatterX, y0 + stair + (1 - e) * 22 + scatterY);
            ctx.rotate(rot);
            ctx.fillStyle = (i % 4 === 0) ? accent : '#fff';
            ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,.35)';
            ctx.shadowBlur = 12;
            ctx.fillText(ch, 0, 0);
            ctx.restore();
            x += widths[i] + base * 0.04;
        });
    }

    function lyPvDrawVertical(ctx, W, H, S, pIn, pOut, hold, accent) {
        const chars = S.chars.filter(c => c.trim());
        const n = chars.length || 1;
        const size = Math.min(H * 0.7 / Math.max(n, 1), W * 0.13, 38);
        const e0 = lyEaseOutCubic(pIn);
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.globalAlpha = e0 * (1 - pOut) * 0.2;
            ctx.fillStyle = '#fff';
            ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let y = H / 2 - (n - 1) * size * 0.55;
            const x = W / 2 + side * size * 1.7;
            chars.forEach(ch => { ctx.fillText(ch, x, y); y += size * 1.1; });
            ctx.restore();
        }
        let y = H / 2 - (n - 1) * size * 0.55 + (1 - e0) * 28;
        chars.forEach((ch, i) => {
            const e = lyPvEnterFactor(S.plan.enter, pIn, i, n);
            const dx = S.plan.exit === 'slideX' ? pOut * size * 1.2 * (i % 2 ? 1 : -1) : 0;
            ctx.save();
            ctx.globalAlpha = e * (1 - pOut);
            ctx.fillStyle = (S.plan.accentFlash && i === Math.floor(hold * n) % n) ? accent : '#fff';
            ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,.4)';
            ctx.shadowBlur = 16;
            ctx.fillText(ch, W / 2 + dx, y);
            ctx.restore();
            y += size * 1.1;
        });
    }

    function lyPvDrawBand(ctx, W, H, S, pIn, pOut, hold, accent) {
        const size = lyPvFitFont(ctx, S.text, W * 0.84, Math.min(H * 0.14, 48), 18, 700);
        const y = H * 0.48;
        const bandH = size * 1.6;
        const wipe = lyEaseOutCubic(pIn);
        ctx.save();
        ctx.globalAlpha = 0.38 * (1 - pOut);
        ctx.fillStyle = accent;
        ctx.fillRect(0, y - bandH / 2, W * wipe, bandH);
        ctx.beginPath();
        ctx.rect(0, y - bandH / 2 - 4, W * Math.max(wipe, 0.02), bandH + 8);
        ctx.clip();
        ctx.globalAlpha = Math.min(1, wipe * 1.15) * (1 - pOut);
        ctx.fillStyle = '#fff';
        ctx.font = '700 ' + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.35)';
        ctx.shadowBlur = 14;
        ctx.fillText(S.text, W / 2, y + pOut * 18);
        ctx.restore();
        if (S.tr && wipe > 0.55) {
            ctx.globalAlpha = (wipe - 0.55) / 0.45 * 0.7 * (1 - pOut);
            ctx.fillStyle = 'rgba(255,255,255,.88)';
            ctx.font = '500 ' + Math.max(12, size * 0.4) + 'px system-ui,-apple-system,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(S.tr, W / 2, y + size * 0.95);
        }
    }


    /* 多轨道条带：每首歌随机最多 5 条互不平行弧轨 */
    let lySphereTracks = null, lySphereTrackSong = null;

    function lySphereSeeded(seed) {
        let s = (seed >>> 0) || 1;
        return function () {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    function lySphereEnsureTracks(songKey, W, H) {
        if (lySphereTracks && lySphereTrackSong === songKey && lySphereTracks._W === W && lySphereTracks._H === H)
            return lySphereTracks;
        const seed = Math.imul(String(songKey || 'x').length + 17, 2654435761) ^ 0x9e3779b9;
        const rnd = lySphereSeeded(seed >>> 0);
        const tracks = [];
        const angles = [];
        for (let i = 0; i < 5; i++) {
            let tries = 0, ang;
            do {
                ang = (rnd() - 0.5) * Math.PI * 0.95;
                tries++;
            } while (tries < 28 && angles.some(a => Math.abs(a - ang) < 0.22));
            angles.push(ang);
            tracks.push({
                ang: ang,
                y0: H * (0.14 + rnd() * 0.72),
                curve: 0.08 + rnd() * 0.2,
                thick: 1.2 + rnd() * 1.6,
                _a: 0
            });
        }
        tracks._W = W; tracks._H = H;
        lySphereTracks = tracks;
        lySphereTrackSong = songKey;
        return tracks;
    }

    function lyPvSphereProgress(local, dur) {
        const t = Math.max(0, Math.min(1, local / Math.max(0.01, dur)));
        if (t < 0.2) return lyEaseOutCubic(t / 0.2) * 0.38;
        if (t < 0.72) return 0.38 + ((t - 0.2) / 0.52) * 0.32;
        return 0.7 + lyEaseInCubic((t - 0.72) / 0.28) * 0.5;
    }

    function lyPvDrawSphereTrack(ctx, W, H, track, alpha) {
        if (alpha <= 0.01) return;
        const cos = Math.cos(track.ang), sin = Math.sin(track.ang);
        const len = W * 1.45;
        ctx.save();
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = 'rgba(15,15,18,.9)';
        ctx.lineWidth = track.thick;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
            const u = -0.15 + (i / 40) * 1.3;
            const localX = (u - 0.5) * len;
            const arc = track.curve * Math.sin(u * Math.PI) * H * 0.32;
            const x = W * 0.5 + localX * cos - arc * sin;
            const y = track.y0 + localX * sin + arc * cos;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    function lyPvDrawSphereRibbon(ctx, W, H, text, track, progress, isCurrent, alpha, fontPx, exitK) {
        const chars = Array.from(String(text || ''));
        if (!chars.length || alpha <= 0.01) return;
        const size = Math.max(10, (fontPx || 28) * (1 - (exitK || 0) * 0.55));
        ctx.font = (isCurrent ? '800 ' : '500 ') + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
        const widths = chars.map(ch => ctx.measureText(ch).width);
        const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * size * 0.06;
        const len = Math.max(W * 1.35, total * 1.35);
        const midX = -len * 0.12 + progress * len * 1.2;
        const cos = Math.cos(track.ang), sin = Math.sin(track.ang);
        let acc = -total / 2;
        chars.forEach((ch, i) => {
            const localX = midX + acc + widths[i] / 2;
            acc += widths[i] + size * 0.06;
            const arc = track.curve * Math.sin((localX / len + 0.5) * Math.PI) * H * 0.32;
            const x = W * 0.5 + localX * cos - arc * sin;
            const y = track.y0 + localX * sin + arc * cos;
            ctx.save();
            ctx.translate(x, y);
            // 正对屏幕：不旋转到轨道切线
            ctx.globalAlpha = alpha * (isCurrent ? 1 : 0.48);
            ctx.fillStyle = isCurrent ? '#0a0a0a' : 'rgba(90,90,95,.9)';
            ctx.font = (isCurrent ? '800 ' : '500 ') + size + 'px system-ui,-apple-system,"PingFang SC",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (isCurrent) { ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 5; }
            ctx.fillText(ch, 0, 0);
            ctx.restore();
        });
    }

    function lyPvDrawSphere(ctx, W, H, S, pIn, pOut, hold, accent, ct) {
        const songKey = (currentTrack && (currentTrack.id || currentTrack.title)) || 'song';
        const tracks = lySphereEnsureTracks(songKey, W, H);
        const local = (ct != null ? ct : S.t0) - S.t0;
        const prog = lyPvSphereProgress(local, S.dur);
        const exitK = local > S.dur * 0.72 ? Math.max(0, Math.min(1, (local - S.dur * 0.72) / (S.dur * 0.28))) : 0;
        const curAlpha = Math.max(0, (1 - exitK * 0.95) * Math.min(1, 0.25 + pIn));
        const fontPx = Math.max(16, Math.min(48, Number(settings.lyricSphereFont) || 28));
        const nLines = lyLines.length;
        let from = Math.max(0, S.idx - 2);
        let to = Math.min(nLines - 1, from + 4);
        from = Math.max(0, to - 4);
        const show = [];
        for (let i = from; i <= to; i++) {
            show.push({ lineIdx: i, trackIdx: ((i % 5) + 5) % 5, line: lyLines[i] });
        }
        const activeSet = new Set(show.map(s => s.trackIdx));
        for (let ti = 0; ti < 5; ti++) {
            const tr = tracks[ti];
            const on = activeSet.has(ti);
            tr._a = on ? Math.min(1, (tr._a || 0) + 0.1) : Math.max(0, (tr._a || 0) - 0.07);
            if (tr._a > 0.02) lyPvDrawSphereTrack(ctx, W, H, tr, tr._a);
        }
        show.forEach(item => {
            const L = item.line;
            if (!L || !L.text) return;
            const tr = tracks[item.trackIdx];
            const isCur = item.lineIdx === S.idx;
            let p = 0.2, a = 0.4, ek = 0;
            if (isCur) { p = prog; a = curAlpha; ek = exitK; }
            else if (item.lineIdx === S.idx + 1) { p = 0.12 + hold * 0.08; a = 0.38; }
            else if (item.lineIdx < S.idx) { p = 0.9; a = 0.12; ek = 0.65; }
            else { p = 0.08; a = 0.26; }
            lyPvDrawSphereRibbon(ctx, W, H, L.text, tr, p, isCur, a, fontPx, ek);
        });
    }

    function lyChatWrapChars(text) {
        return Array.from(String(text || '')).map(ch =>
            '<span class="ch">' + escHtml(ch === ' ' ? '\u00a0' : ch) + '</span>').join('');
    }
    function lyChatOnActive(idx) {
        if (!lyEl || idx < 0 || !lyLines.length) return;
        const list = lyEl.querySelector('.xmp-ly-chat-list');
        const composer = lyEl.querySelector('.xmp-ly-composer-box');
        if (!list) return;
        // 上一句结束：取消放大
        list.querySelectorAll('.xmp-ly-bubble.is-active').forEach(b => {
            b.classList.remove('is-active');
            b.querySelectorAll('.ch').forEach(c => { c.classList.remove('on'); c.classList.add('done'); });
        });
        while (lyChatSent < idx) {
            lyChatSent++;
            const L = lyLines[lyChatSent];
            if (!L) break;
            const side = (lyChatSent % 2 === 0) ? 'them' : 'me';
            const el = document.createElement('div');
            el.className = 'xmp-ly-bubble ' + side;
            el.dataset.i = String(lyChatSent);
            el.innerHTML = lyChatWrapChars(L.text) + (L.tr ? '<span class="tr">' + escHtml(L.tr) + '</span>' : '');
            list.appendChild(el);
            list.scrollTop = list.scrollHeight;
        }
        const active = list.querySelector('.xmp-ly-bubble[data-i="' + idx + '"]');
        if (active) {
            active.classList.add('is-active');
            list.scrollTop = list.scrollHeight;
        }
        clearTimeout(lyTypeTimer);
        let nextMe = -1;
        for (let i = idx + 1; i < lyLines.length; i++) { if (i % 2 === 1) { nextMe = i; break; } }
        if (nextMe < 0 || !composer) { if (composer) composer.innerHTML = '<span style="opacity:.4">…</span>'; return; }
        lyTypeText = lyLines[nextMe].text || '';
        lyTypePos = 0;
        const typeStep = () => {
            if (!lyEl || (settings.lyricStyle || 'scroll') !== 'chat') return;
            lyTypePos = Math.min(lyTypeText.length, lyTypePos + 1);
            composer.innerHTML = escHtml(lyTypeText.slice(0, lyTypePos)) + (lyTypePos < lyTypeText.length ? '<span class="caret"></span>' : '');
            if (lyTypePos < lyTypeText.length) lyTypeTimer = setTimeout(typeStep, 28 + Math.random() * 40);
        };
        composer.innerHTML = '<span class="caret"></span>';
        lyTypeTimer = setTimeout(typeStep, 80);
    }
    function lyChatUpdateProgress(ct) {
        if (!lyEl || (settings.lyricStyle || 'scroll') !== 'chat' || lyIdx < 0 || !lyLines[lyIdx]) return;
        const list = lyEl.querySelector('.xmp-ly-chat-list');
        if (!list) return;
        const bubble = list.querySelector('.xmp-ly-bubble[data-i="' + lyIdx + '"]');
        if (!bubble) return;
        const L = lyLines[lyIdx];
        const nextT = lyLines[lyIdx + 1] ? lyLines[lyIdx + 1].t : (L.t + 4);
        const dur = Math.max(0.35, nextT - L.t);
        const p = Math.max(0, Math.min(1, (ct - L.t) / dur));
        const chars = bubble.querySelectorAll('.ch');
        const n = chars.length || 1;
        const lit = Math.floor(p * n + 0.001);
        for (let i = 0; i < chars.length; i++) {
            chars[i].classList.toggle('on', i <= lit && i >= lit - 1);
            chars[i].classList.toggle('done', i < lit);
        }
        // 整句在句末前保持放大，接近结束略回收（倍数来自设置 lyricChatScale）
        const base = Math.max(1, Math.min(1.5, (Number(settings.lyricChatScale) || 110) / 100));
        const scale = p < 0.85 ? base : base - (p - 0.85) / 0.15 * (base - 1);
        bubble.style.transform = 'scale(' + scale.toFixed(3) + ')';
        if (p >= 0.99) {
            bubble.classList.remove('is-active');
            bubble.style.transform = '';
            chars.forEach(c => { c.classList.remove('on'); c.classList.add('done'); });
        }
    }

    function lyScrollTo(y, dur) {
        const sc = lyEl.querySelector('.xmp-ly-scroll');
        cancelAnimationFrame(lyTween);
        const y0 = sc.scrollTop, dy = y - y0;
        if (Math.abs(dy) < 1) return;
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / dur);
            sc.scrollTop = y0 + dy * (1 - Math.pow(1 - k, 3));
            if (k < 1) lyTween = xmpRaf(step);
        };
        lyTween = xmpRaf(step);
    }

    function lyScrollToActive() {
        const sc = lyEl.querySelector('.xmp-ly-scroll');
        const n = lyEl.querySelector('.xmp-ly-lines').children[lyIdx];
        const y = n ? Math.max(0, n.offsetTop - sc.clientHeight * 0.26) : 0;
        lyScrollTo(y, 520);
    }

    function lyFillTrack() {
        try { if (window.XmpJizuraPlayer) window.XmpJizuraPlayer.invalidate(); } catch (e) {}
        _lyCoverPalette = null; _lyCoverPaletteKey = '';
        const tr = currentTrack;
        if (!tr || !lyEl) return;
        lyEl.querySelector('.xmp-ly-title').textContent = tr.customTitle || tr.title || '未知歌曲';
        lyEl.querySelector('.xmp-ly-artist').textContent = tr.artist || tr.source || tr.owner || '';
        const cv = lyEl.querySelector('.xmp-ly-cover');
        const bg = lyEl.querySelector('.xmp-ly-bgimg');
        if (tr.cover) {
            const big = resolveCoverSrc(lySized(tr.cover, 800)) || tr.cover;
            cv.innerHTML = '<img src="' + escHtml(big) + '" alt="" referrerpolicy="no-referrer">';
            const small = lySized(tr.cover, 120).replace(/["'()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16));
            bg.style.backgroundImage = 'url("' + small + '")';
        } else {
            cv.innerHTML = ICON_MUSIC_LARGE;
            bg.style.backgroundImage = '';
        }
        updateLyricPlayBtn();
        lyLoad(tr);
    }

    function updateLyricPlayBtn() {
        if (!lyEl) return;
        const b = lyEl.querySelector('.xmp-ly-btn.play');
        if (b) b.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
        lyEl.classList.toggle('playing', !!isPlaying);
    }

    function lyTick() {
        lyRaf = 0;
        if (!lyOpen || !lyEl) return;
        if (!currentTrack) { closeLyricPage('down'); return; }
        if (currentTrack.id !== lyTrackId) lyFillTrack();
        if (audio) {
            const ct = audio.currentTime || 0;
            if (lyLines.length) {
                const r = lyFindIndex(lyLines, ct + 0.15);
                const st = settings.lyricStyle || 'scroll';
                if (r !== lyIdx) lySetActive(r);
                // JIZURA：每帧都跟 currentTime 画，不依赖「是否换行」
                // （原先只在 r===lyIdx 的 else 分支画，换行帧会漏画；且 lySetActive 异步时会空窗）
                if (st === 'jizura') lyJizuraEnsureAndDraw(ct);
                if (st === 'folia') lyFoliaEnsureAndDraw(ct);
                else if (r === lyIdx && st === 'chat') lyChatUpdateProgress(ct);
                else if (r === lyIdx && lyIsPvStyle(st)) lyPvDraw(ct);
            }
            if (!lyDragging) {
                const dur = audio.duration;
                const key = Math.floor(ct) + '/' + Math.floor(dur || 0);
                lyEl.querySelector('.xmp-ly-in').style.width = (dur && isFinite(dur) ? Math.min(100, ct / dur * 100) : 0) + '%';
                if (key !== lySecKey) {
                    lySecKey = key;
                    lyEl.querySelector('.xmp-ly-cur').textContent = formatTime(ct);
                    lyEl.querySelector('.xmp-ly-dur').textContent = formatTime(dur);
                }
            }
        }
        lyRaf = xmpRaf(lyTick);
    }

    function lyMarkUserScroll() {
        lyUserScroll = true;
        xmpCaf(lyTween);
        clearTimeout(lyUserTimer);
        lyEl.classList.add('free');
    }
    function lyReleaseUserScroll(delay) {
        clearTimeout(lyUserTimer);
        lyUserTimer = setTimeout(() => {
            lyUserScroll = false;
            if (lyEl) { lyEl.classList.remove('free'); if (lyIdx >= 0) lyScrollToActive(); }
        }, delay);
    }

    function lyEnsure() {
        if (lyEl) return lyEl;
        const el = document.createElement('div');
        el.className = 'xmp-ly';
        el.innerHTML =
            '<div class="xmp-ly-bg"><div class="xmp-ly-bgimg"></div><div class="xmp-ly-bgdim"></div></div>' +
            '<div class="xmp-ly-top"><button type="button" class="xmp-ly-close" title="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' +
                        '<button type="button" class="xmp-ly-edit-pl" title="编辑歌单">编辑歌单</button></div>' +
            '<div class="xmp-ly-head"><div class="xmp-ly-cover"></div><div class="xmp-ly-meta"><div class="xmp-ly-title"></div><div class="xmp-ly-artist"></div></div></div>' +
            '<div class="xmp-ly-lyrics">' +
            '<div class="xmp-ly-scroll"><div class="xmp-ly-lines"></div></div>' +
            '<div class="xmp-ly-chat"><div class="xmp-ly-chat-list"></div>' +
            '<div class="xmp-ly-composer"><div class="xmp-ly-composer-box"></div>' +
            '<button type="button" class="xmp-ly-composer-send" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div></div>' +
            '<div class="xmp-ly-pv"></div>' +
            '</div>' +
            '<div class="xmp-ly-picker"><div class="xmp-ly-picker-track"></div>' +
            '<div class="xmp-ly-picker-tip">滑动选择 · 轻点确认 · 点×移除</div>' +
            '<button type="button" class="xmp-ly-picker-trash" title="回收站">🗑</button>' +
            '<div class="xmp-ly-restore-sheet"><div class="xmp-ly-restore-panel">' +
            '<h4>已移除的样式</h4><div class="xmp-ly-restore-list"></div>' +
            '<button type="button" class="xmp-ly-restore-item" data-close="1" style="justify-content:center;opacity:.8">关闭</button>' +
            '</div></div></div>' +
            '<div class="xmp-ly-ctrl">' +
            '<div class="xmp-ly-prog"><div class="xmp-ly-bar"><div class="xmp-ly-in"></div></div></div>' +
            '<div class="xmp-ly-times"><span class="xmp-ly-cur">00:00</span><span class="xmp-ly-dur">00:00</span></div>' +
            '<div class="xmp-ly-btns">' +
            '<button type="button" class="xmp-ly-btn prev">' + ICON_PREV + '</button>' +
            '<button type="button" class="xmp-ly-btn play">' + ICON_PLAY + '</button>' +
            '<button type="button" class="xmp-ly-btn next">' + ICON_NEXT + '</button>' +
            '</div></div>';
        panel.appendChild(el);
        lyEl = el;

        el.querySelector('.xmp-ly-close').addEventListener('click', () => closeLyricPage('down'));
        const jzBtn = el.querySelector('.xmp-ly-jizura');
        if (jzBtn) jzBtn.addEventListener('click', () => openJizuraPreview());
        const trashBtn = el.querySelector('.xmp-ly-picker-trash');
        if (trashBtn) trashBtn.addEventListener('click', (e) => { e.stopPropagation(); lyOpenRestoreSheet(); });
        const restoreSheet = el.querySelector('.xmp-ly-restore-sheet');
        if (restoreSheet) {
            restoreSheet.addEventListener('click', (e) => {
                const t = e.target.closest('[data-restore],[data-close]');
                if (!t) return;
                if (t.getAttribute('data-close')) restoreSheet.classList.remove('show');
                const rid = t.getAttribute('data-restore');
                if (rid) { lyRestoreStyleId(rid); restoreSheet.classList.remove('show'); }
            });
        }
        const pickTrack = el.querySelector('.xmp-ly-picker-track');
        if (pickTrack) {
            const onDel = (e) => {
                const del = e.target.closest && e.target.closest('[data-del]');
                if (!del) return;
                e.stopPropagation();
                e.preventDefault();
                try { e.stopImmediatePropagation(); } catch (_) {}
                window.__xmpLyPickSkip = true;
                lyHideStyleId(del.getAttribute('data-del'));
            };
            pickTrack.addEventListener('pointerdown', onDel, true);
            pickTrack.addEventListener('touchstart', onDel, true);
            pickTrack.addEventListener('click', onDel, true);
        }
        el.querySelector('.xmp-ly-btn.prev').addEventListener('click', () => playPrev());
        el.querySelector('.xmp-ly-btn.next').addEventListener('click', () => playNext());
        el.querySelector('.xmp-ly-btn.play').addEventListener('click', () => { togglePlay(); setTimeout(updateLyricPlayBtn, 0); });

        // 点歌词跳转
        el.querySelector('.xmp-ly-lines').addEventListener('click', (e) => {
            const n = e.target.closest('.xmp-ly-line');
            if (!n || !audio) return;
            const l = lyLines[parseInt(n.dataset.i, 10)];
            if (!l) return;
            try { audio.currentTime = l.t + 0.01; } catch (_) { }
            lyUserScroll = false; clearTimeout(lyUserTimer); el.classList.remove('free');
            if (audio.paused) { try { audio.play(); } catch (_) { } }
        });

        // 手动滚动歌词时暂停自动居中
        const sc = el.querySelector('.xmp-ly-scroll');
        sc.addEventListener('touchstart', lyMarkUserScroll, { passive: true });
        sc.addEventListener('touchend', () => lyReleaseUserScroll(2800), { passive: true });
        sc.addEventListener('touchcancel', () => lyReleaseUserScroll(2800), { passive: true });
        sc.addEventListener('wheel', () => { lyMarkUserScroll(); lyReleaseUserScroll(2800); }, { passive: true });

        // 进度条拖动
        const prog = el.querySelector('.xmp-ly-prog');
        const seekFrom = (e) => {
            const r = prog.getBoundingClientRect();
            const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            const dur = audio && audio.duration;
            el.querySelector('.xmp-ly-in').style.width = (k * 100) + '%';
            if (dur && isFinite(dur)) el.querySelector('.xmp-ly-cur').textContent = formatTime(k * dur);
            return k;
        };
        let pk = 0;
        prog.addEventListener('pointerdown', (e) => {
            lyDragging = true; prog.classList.add('drag');
            try { prog.setPointerCapture(e.pointerId); } catch (_) { }
            pk = seekFrom(e);
        });
        prog.addEventListener('pointermove', (e) => { if (lyDragging) pk = seekFrom(e); });
        const endDrag = () => {
            if (!lyDragging) return;
            lyDragging = false; prog.classList.remove('drag');
            const dur = audio && audio.duration;
            if (dur && isFinite(dur)) { try { audio.currentTime = pk * dur; } catch (_) { } }
            lyUserScroll = false; el.classList.remove('free');
        };
        prog.addEventListener('pointerup', endDrag);
        prog.addEventListener('pointercancel', endDrag);

        // 右滑返回（样式选择模式下禁用，避免与切换样式冲突）
        let sx = 0, sy = 0, sdx = 0, mode = 0, st = 0;
        el.addEventListener('touchstart', (e) => {
            if (lyPickMode) { mode = 2; return; }
            if (e.touches.length !== 1 || e.target.closest('.xmp-ly-prog')) { mode = 2; return; }
            sx = e.touches[0].clientX; sy = e.touches[0].clientY; sdx = 0; mode = 0; st = Date.now();
        }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            if (lyPickMode) { mode = 2; return; }
            if (mode === 2 || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
            if (mode === 0) {
                if (dx > 12 && dx > Math.abs(dy) * 1.4) { mode = 1; el.classList.add('dragging'); }
                else if (Math.abs(dy) > 12 || dx < -12) { mode = 2; return; }
                else return;
            }
            sdx = Math.max(0, dx);
            el.style.transform = 'translateX(' + sdx + 'px)';
        }, { passive: true });
        const swipeEnd = () => {
            if (lyPickMode) { mode = 2; el.classList.remove('dragging'); el.style.transform = ''; return; }
            if (mode === 1) {
                el.classList.remove('dragging');
                const v = sdx / Math.max(1, Date.now() - st);
                if (sdx > el.clientWidth * 0.28 || (v > 0.6 && sdx > 40)) closeLyricPage('right');
                else el.style.transform = '';
            }
            mode = 0;
        };
        el.addEventListener('touchend', swipeEnd, { passive: true });
        el.addEventListener('touchcancel', swipeEnd, { passive: true });
        lyBindStylePicker(el);
        return el;
    }

    /* 样式选择：lyPickOffset = 连续下标（0=第一张居中…），用实测卡片宽度避免前几项消失 */
    function lyCardMetrics() {
        const track = lyEl && lyEl.querySelector('.xmp-ly-picker-track');
        const card = track && track.querySelector('.xmp-ly-picker-card');
        const gap = 14;
        const w = card ? card.offsetWidth : 156;
        return { w: w || 156, gap, step: (w || 156) + gap };
    }
    function lyPickerClampScroll(x) {
        const n = Math.max(1, lyVisibleStyles().length);
        const min = 0, max = n - 1;
        if (x < min) return min + (x - min) * 0.18;
        if (x > max) return max + (x - max) * 0.18;
        return x;
    }
    function lyPickerLayout() {
        if (!lyEl) return;
        const track = lyEl.querySelector('.xmp-ly-picker-track');
        if (!track) return;
        const vis = lyVisibleStyles();
        const { w, step } = lyCardMetrics();
        const vw = lyEl.clientWidth || 360;
        const x = vw / 2 - w / 2 - lyPickOffset * step;
        track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,-50%,0)';
        const idx = Math.max(0, Math.min(vis.length - 1, Math.round(lyPickOffset)));
        lyPickIdx = idx;
        const cards = track.children;
        for (let i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('on', i === idx);
            cards[i].style.visibility = 'visible';
            cards[i].style.display = 'flex';
        }
    }
    function lyHideStyleId(id) {
        if (id === 'scroll') { showToast('经典滚动不可移除'); return; }
        const hid = lyHiddenIds().filter(x => x !== id);
        hid.push(String(id));
        settings.lyricHiddenStyles = hid;
        saveSettings();
        if (settings.lyricStyle === id) {
            settings.lyricStyle = 'scroll';
            saveSettings();
            lyApplyStyleClass();
            if (lyIdx >= 0) lySetActive(lyIdx);
        }
        lyPickerBuild();
        showToast('已移到回收站');
    }
    function lyRestoreStyleId(id) {
        settings.lyricHiddenStyles = lyHiddenIds().filter(x => x !== id);
        saveSettings();
        lyPickerBuild();
        showToast('已恢复样式');
    }
    function lyOpenRestoreSheet() {
        if (!lyEl) return;
        const sheet = lyEl.querySelector('.xmp-ly-restore-sheet');
        const list = lyEl.querySelector('.xmp-ly-restore-list');
        if (!sheet || !list) return;
        const hid = lyHiddenIds();
        if (!hid.length) list.innerHTML = '<div class="xmp-ly-restore-empty">回收站是空的</div>';
        else {
            list.innerHTML = hid.map(id => {
                const s = LY_STYLES_ALL.find(x => x.id === id) || { id: id, lab: id, ico: '?', hint: '' };
                return '<button type="button" class="xmp-ly-restore-item" data-restore="' + s.id + '">' +
                    '<span style="font-size:22px">' + s.ico + '</span><span style="flex:1"><b>' + s.lab +
                    '</b><br><span style="opacity:.65;font-size:12px">' + (s.hint || '') + '</span></span><span>恢复</span></button>';
            }).join('');
        }
        sheet.classList.add('show');
    }
    function lyPickerBuild() {
        if (!lyEl) return;
        const track = lyEl.querySelector('.xmp-ly-picker-track');
        if (!track) return;
        const vis = lyVisibleStyles();
        const cur = settings.lyricStyle || 'scroll';
        let i = vis.findIndex(s => s.id === cur);
        if (i < 0) i = 0;
        lyPickIdx = i;
        lyPickOffset = i;
        track.innerHTML = vis.map((s, j) =>
            '<div class="xmp-ly-picker-card' + (j === i ? ' on' : '') + '" data-i="' + j + '" data-id="' + s.id + '" style="position:relative">' +
            '<button type="button" class="del" data-del="' + s.id + '" title="移除">×</button>' +
            '<div class="ico">' + s.ico + '</div><div class="lab">' + s.lab + '</div>' +
            '<div class="hint">' + s.hint + '</div></div>').join('');
        lyPickerLayout();
        requestAnimationFrame(() => { lyPickerLayout(); requestAnimationFrame(lyPickerLayout); });
    }
    function lyEnterPicker() {
        if (!lyEl || lyPickMode) return;
        lyPickMode = true;
        lyPickVel = 0;
        if (lyPickRaf) { cancelAnimationFrame(lyPickRaf); lyPickRaf = 0; }
        lyPickerBuild();
        lyEl.classList.remove('dragging');
        lyEl.style.transform = '';
        lyEl.classList.add('is-picking');
        try { hapticLight(); } catch (e) {}
    }
    function lyExitPicker(confirm) {
        if (!lyEl || !lyPickMode) return;
        lyPickMode = false;
        if (lyPickRaf) { cancelAnimationFrame(lyPickRaf); lyPickRaf = 0; }
        lyEl.classList.remove('is-picking');
        if (confirm) {
            const st = lyVisibleStyles()[lyPickIdx];
            if (st) {
                if ((settings.lyricStyle || '') === 'jizura' && st.id !== 'jizura') lyLeaveJizuraSurface();
                if ((settings.lyricStyle || '') === 'folia' && st.id !== 'folia') lyLeaveFoliaSurface();
                settings.lyricStyle = st.id;
                try { saveSettings(); } catch (e) {}
                lyApplyStyleClass();
                if (lyLines.length) {
                    lyRender(lyLines);
                    // 必须按 audio 进度重算索引，不能沿用 jizura 期间的 lyIdx 观感差
                    requestAnimationFrame(() => lySyncToAudio());
                }
                showToast('歌词样式：' + st.lab);
            }
        }
    }
    function lyBindStylePicker(el) {
        let holdT = 0, holding = false;
        let sx = 0, sy = 0, lastX = 0, lastT = 0;
        let moved = false, draggingPick = false;
        let startScroll = 0;

        const onDown = (e) => {
            if (e.target.closest('.xmp-ly-ctrl, .xmp-ly-close, .xmp-ly-prog, .xmp-ly-btn')) return;
            const pt = e.touches ? e.touches[0] : e;
            sx = pt.clientX; sy = pt.clientY;
            if (lyPickMode) {
                if (lyPickRaf) { cancelAnimationFrame(lyPickRaf); lyPickRaf = 0; }
                lastX = pt.clientX; lastT = performance.now();
                startScroll = lyPickOffset;
                moved = false; draggingPick = true; lyPickVel = 0;
                return;
            }
            holding = true; moved = false;
            holdT = setTimeout(() => { if (holding) lyEnterPicker(); }, 480);
        };

        const onMove = (e) => {
            const pt = e.touches ? e.touches[0] : e;
            if (!lyPickMode) {
                if (holding && Math.hypot(pt.clientX - sx, pt.clientY - sy) > 10) {
                    holding = false; clearTimeout(holdT);
                }
                return;
            }
            if (!draggingPick) return;
            const now = performance.now();
            const dx = pt.clientX - lastX;
            const dt = Math.max(8, now - lastT);
            // 手指往右 → 看更小下标（左边卡片）；offset 为连续下标
            const step = lyCardMetrics().step || 170;
            lyPickVel = -dx / dt / step;
            lyPickOffset = lyPickerClampScroll(lyPickOffset - dx / step);
            lastX = pt.clientX; lastT = now;
            if (Math.abs(lyPickOffset - startScroll) > 0.08) moved = true;
            lyPickerLayout();
            if (e.cancelable) try { e.preventDefault(); } catch (_) {}
        };

        const snapToNearest = () => {
            const n = lyVisibleStyles().length;
            const coast = lyPickVel * 160;
            let targetIdx = Math.round(lyPickOffset + coast);
            targetIdx = Math.max(0, Math.min(n - 1, targetIdx));
            const from = lyPickOffset;
            const target = targetIdx;
            const dist = Math.abs(target - from);
            const dur = Math.max(200, Math.min(420, 160 + dist * 120));
            const t0 = performance.now();
            if (lyPickRaf) cancelAnimationFrame(lyPickRaf);
            const stepFn = (now) => {
                if (!lyPickMode) { lyPickRaf = 0; return; }
                const u = Math.min(1, (now - t0) / dur);
                const e = 1 - Math.pow(1 - u, 3);
                lyPickOffset = from + (target - from) * e;
                lyPickerLayout();
                if (u < 1) lyPickRaf = xmpRaf(stepFn);
                else {
                    lyPickRaf = 0;
                    lyPickOffset = target;
                    lyPickIdx = targetIdx;
                    lyPickerLayout();
                }
            };
            lyPickRaf = xmpRaf(stepFn);
        };

        const onUp = (e) => {
            holding = false; clearTimeout(holdT);
            if (!lyPickMode) return;
            draggingPick = false;
            if (window.__xmpLyPickSkip) { window.__xmpLyPickSkip = false; return; }
            if (!moved) {
                const t = e.changedTouches ? e.changedTouches[0] : e;
                const hit = document.elementFromPoint(t.clientX, t.clientY);
                if (hit && hit.closest && hit.closest('[data-del]')) return;
                const c = hit && hit.closest && hit.closest('.xmp-ly-picker-card');
                if (c && c.dataset.i != null) {
                    lyPickIdx = parseInt(c.dataset.i, 10) || 0;
                    lyPickOffset = lyPickIdx;
                    lyPickerLayout();
                    lyExitPicker(true);
                }
                return;
            }
            // 有滑动：只吸附，绝不退出
            snapToNearest();
        };

        el.addEventListener('touchstart', onDown, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onUp, { passive: true });
        el.addEventListener('touchcancel', () => {
            holding = false; clearTimeout(holdT); draggingPick = false;
            if (lyPickMode && moved) snapToNearest();
        }, { passive: true });
        el.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', (e) => { if (lyPickMode && draggingPick) onMove(e); });
        window.addEventListener('mouseup', (e) => { if (holding || (lyPickMode && draggingPick)) onUp(e); });
    }

    function openLyricPage() {
        if (!panel || !currentTrack) return;
        const el = lyEnsure();
        if (lyOpen) return;
        el.style.transform = '';
        lyOpen = true; lyTrackId = null; lySecKey = '';
        lyUserScroll = false; el.classList.remove('free');
        lyPickMode = false; el.classList.remove('is-picking');
        lyApplyStyleClass();
        lyFillTrack();
        requestAnimationFrame(() => {
            el.classList.add('show');
            if ((settings.lyricStyle || '') === 'jizura') lyJizuraBoot(true);
        });
        if (!lyRaf) lyRaf = xmpRaf(lyTick);
        try { history.pushState({ xmpLy: 1 }, ''); lyHistPushed = true; } catch (e) { lyHistPushed = false; }
        try {
            const editBtn = el.querySelector('.xmp-ly-edit-pl');
            if (editBtn && !editBtn.dataset.bound) {
                editBtn.dataset.bound = '1';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const pl = getCurrentPlaylist();
                    if (!pl) { showToast('当前无歌单'); return; }
                    closeLyricPage();
                    switchAppView('playlist');
                    openPlaylistDetail(pl.id);
                    showToast('可在此编辑歌单曲目');
                });
            }
        } catch (e) {}
        // 横竖屏切换时刷新当前 PV 句排版
        try {
            if (!window.__xmpLyOrientBound) {
                window.__xmpLyOrientBound = true;
                const onOrient = () => {
                    if (!lyOpen || !lyEl) return;
                    lyUpdateLandscapeClass();
                    if (lyIsPvStyle() && (settings.lyricStyle || '') !== 'jizura' && lyIdx >= 0) lyPvOnActive(lyIdx);
                };
                window.addEventListener('orientationchange', onOrient);
                window.addEventListener('resize', onOrient);
            }
        } catch (e) {}
    }

    function closeLyricPage(dir, fromPop) {
        if (!lyOpen || !lyEl) return;
        lyOpen = false;
        lyLeaveJizuraSurface();
        xmpCaf(lyRaf); lyRaf = 0;
        xmpCaf(lyTween);
        clearTimeout(lyUserTimer);
        const el = lyEl;
        el.classList.remove('dragging');
        if (dir === 'right') {
            el.style.transform = 'translateX(100%)';
            setTimeout(() => { if (!lyOpen) el.style.transform = ''; }, 460);
        }
        el.classList.remove('show');
        if (lyHistPushed && !fromPop) { lyHistPushed = false; try { history.back(); } catch (e) { } }
        lyHistPushed = false;
    }

    window.addEventListener('popstate', () => { if (lyOpen) closeLyricPage('right', true); });
    // 原生返回键可调用：if (window.xmpHandleBack && window.xmpHandleBack()) return;
    window.xmpHandleBack = function () { if (lyOpen) { closeLyricPage('right'); return true; } return false; };


    /* ========== 图标 ========== */
    const ICON_MUSIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    const ICON_MUSIC_LARGE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const ICON_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>`;
    const ICON_PREV = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
    const ICON_NEXT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>`;
    const ICON_PAUSE_SMALL = ICON_PAUSE;
    const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    const ICON_CROSS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:.85em;height:.85em;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const ICON_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:.9em;height:.9em;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const ICON_REFRESH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.9em;height:.9em;"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
    const ICON_LOOP_LIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.9em;height:.9em;"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    const ICON_LOOP_SINGLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.9em;height:.9em;"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="currentColor" stroke="none">1</text></svg>`;
    const ICON_SHUFFLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.9em;height:.9em;"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`;
    const ICON_UPLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
    const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.85em;height:.85em;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.85em;height:.85em;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    const ICON_STATS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
    const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.95em;height:.95em;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    /* ========== 样式应用 ========== */
    function xmpHexToRgb(hex) {
        let h = String(hex || '').replace('#', '').trim();
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length < 6) return [10, 10, 12];
        return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
    }
    function xmpRgbToHex(r, g, b) {
        const c = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
        return '#' + c(r) + c(g) + c(b);
    }
    function xmpMixHex(a, b, t) {
        const A = xmpHexToRgb(a), B = xmpHexToRgb(b);
        return xmpRgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
    }
    function xmpHexAlpha(hex, a) {
        const [r, g, b] = xmpHexToRgb(hex);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function applyColorTheme(id) {
        const t = COLOR_THEMES.find(c => c.id === (id || settings.colorTheme)) || COLOR_THEMES[0];
        const accent = settings.colorAccent || t.accent;
        const g1 = settings.colorGradStart || accent;
        const g2 = settings.colorGradEnd || accent;
        const grad = 'linear-gradient(135deg,' + g1 + ' 0%,' + g2 + ' 100%)';
        const gradSoft = 'linear-gradient(160deg,' + xmpMixHex(g1, '#000', 0.55) + ' 0%,' + xmpMixHex(g2, '#000', 0.62) + ' 55%,' + xmpMixHex(g1, '#000', 0.72) + ' 100%)';
        const useCustomBg = settings.useCustomBgColor === true || settings.useCustomBgColor === 'true';
        const solidBg = settings.bgSolidColor || '#0a0a0c';
        const panelBg = useCustomBg ? solidBg : gradSoft;
        const wallBg = useCustomBg ? solidBg : gradSoft;
        const navBg = useCustomBg
            ? xmpHexAlpha(solidBg, 0.82)
            : ('linear-gradient(135deg,' + xmpHexAlpha(g1, 0.88) + ' 0%,' + xmpHexAlpha(g2, 0.88) + ' 100%)');
        const navBorder = useCustomBg ? xmpHexAlpha('#ffffff', 0.08) : xmpHexAlpha(g2, 0.35);
        const cardBg = useCustomBg
            ? xmpMixHex(solidBg, '#ffffff', settings.theme === 'light' ? 0.08 : 0.06)
            : xmpHexAlpha(g1, 0.14);
        const bg1 = useCustomBg ? solidBg : xmpMixHex(g1, '#000', 0.78);
        const bg2 = useCustomBg ? xmpMixHex(solidBg, '#fff', 0.07) : xmpMixHex(g1, '#000', 0.68);
        const bg3 = useCustomBg ? xmpMixHex(solidBg, '#fff', 0.12) : xmpMixHex(g2, '#000', 0.6);

        const targets = [panel, fab].filter(Boolean);
        for (const root of targets) {
            root.style.setProperty('--accent', accent);
            root.style.setProperty('--accent-2', g2);
            root.style.setProperty('--accent-fg', t.accentFg || '#ffffff');
            root.style.setProperty('--accent-grad', grad);
            root.style.setProperty('--grad', grad);
            root.style.setProperty('--accent-soft', xmpHexAlpha(accent, 0.18));
            root.style.setProperty('--panel-bg', panelBg);
            root.style.setProperty('--wall-bg', wallBg);
            root.style.setProperty('--nav-bg', navBg);
            root.style.setProperty('--nav-border', navBorder);
            root.style.setProperty('--card-bg', cardBg);
            root.style.setProperty('--bg-1', bg1);
            root.style.setProperty('--bg-2', bg2);
            root.style.setProperty('--bg-3', bg3);
            root.style.setProperty('--bg-base', useCustomBg ? solidBg : xmpMixHex(g1, '#000', 0.85));
        }
        const navOp = Math.max(0.15, Math.min(1, (Number(settings.navOpacity) || 75) / 100));
        const cardOp = Math.max(0.15, Math.min(1, (Number(settings.cardOpacity) || 88) / 100));
        const navBlur = Math.max(0, Number(settings.navBlur) || 0);
        const cardBlur = Math.max(0, Number(settings.cardBlur) || 0);
        let navBgFinal, cardBgFinal;
        if (useCustomBg) {
            navBgFinal = xmpHexAlpha(solidBg, navOp);
            cardBgFinal = xmpHexAlpha(solidBg, cardOp);
        } else {
            navBgFinal = 'linear-gradient(135deg,' + xmpHexAlpha(g1, navOp) + ' 0%,' + xmpHexAlpha(g2, navOp) + ' 100%)';
            cardBgFinal = 'linear-gradient(135deg,' + xmpHexAlpha(g1, cardOp) + ' 0%,' + xmpHexAlpha(g2, cardOp) + ' 100%)';
        }
        if (panel) {
            panel.style.setProperty('--nav-bg', navBgFinal);
            panel.style.setProperty('--card-bg-fill', cardBgFinal);
            panel.style.setProperty('--nav-blur', navBlur + 'px');
            panel.style.setProperty('--card-blur', cardBlur + 'px');
            panel.style.setProperty('--page-fade', ((Number(settings.pageFadeMs) || 300) / 1000) + 's');
            const chatScale = Math.max(1, Math.min(1.5, (Number(settings.lyricChatScale) || 110) / 100));
            panel.style.setProperty('--ly-chat-scale', String(chatScale));
        }
    }

    function hapticLight() {
        if (settings.navHaptic === false || settings.navHaptic === 'false') return;
        try { if (navigator.vibrate) navigator.vibrate(14); } catch (e) {}
        try { if (window.GM && typeof window.GM.vibrate === 'function') window.GM.vibrate(14); } catch (e) {}
    }

    function ncmItemToTrack(item) {
        if (!item) return null;
        const id = String(item.id || item.neteaseId || '');
        return {
            id: uid('ncm'),
            type: 'netease',
            neteaseId: id,
            title: item.name || item.title || '未知',
            artist: item.artist || item.arName || '',
            album: item.album || '',
            cover: item.cover || item.picUrl || '',
            duration: item.duration || 0,
            source: '网易云音乐',
            fee: item.fee || 0
        };
    }


    function applySettings() {
        try {
            if (panel) {
                const hm = settings.homeMode || 'wall';
                panel.setAttribute('data-home-mode', hm);
                panel.classList.toggle('ipod-mode', hm === 'ipod');
            }
        } catch (_) {}

        const theme = settings.theme || 'dark';
        if (fab) {
            fab.dataset.theme = theme;
            fab.style.width = settings.collapsedSize + 'px';
            fab.style.height = settings.collapsedSize + 'px';
        }
        if (panel) {
            panel.dataset.theme = theme;
            panel.classList.toggle('theme-black-default', theme === 'black');
            panel.style.width = settings.expandedWidth + 'px';
            panel.style.height = settings.expandedHeight + 'px';
            panel.style.fontSize = settings.baseFontSize + 'px';
            panel.style.setProperty('--xmp-cover-size', settings.playlistCoverSize + 'px');
            applyColorTheme(settings.colorTheme || 'ocean');
            if (settings.playerStyle === 'vinyl') panel.classList.add('vinyl');
            else panel.classList.remove('vinyl');

            const bgLayer = panel.querySelector('.xmp-bg-image');
            const dimLayer = panel.querySelector('.xmp-bg-dim');
            if (bgLayer) {
                bgLayer.style.filter = `blur(${settings.bgImageBlur}px)`;
                bgLayer.style.transform = `scale(${settings.bgImageScale / 100})`;
                bgLayer.style.backgroundPosition = `${settings.bgImageX}% ${settings.bgImageY}%`;
                if (settings.playerStyle !== 'vinyl') {
                    if (settings.bgImage) {
                        bgLayer.style.backgroundImage = `url('${settings.bgImage}')`;
                        if (dimLayer) dimLayer.style.background = `rgba(0,0,0,${settings.bgImageDim / 100})`;
                    } else {
                        bgLayer.style.backgroundImage = '';
                        if (dimLayer) dimLayer.style.background = 'transparent';
                    }
                }
            }
            const progressTrack = panel.querySelector('.xmp-progress-track');
            if (progressTrack) progressTrack.style.height = settings.progressHeight + 'px';
            if (settings.playerStyle === 'vinyl') updateNowPlayingUI();
        }
        if (audio) audio.volume = settings.defaultVolume / 100;
        applyWallCssVars();
        const wallView = panel && panel.querySelector('#xmp-view-wall');
        if (wallView && wallView.style.display !== 'none') renderWall({ resetScroll: false });
        if (window.GM && window.GM.updateFloatingConfig) {
            try { window.GM.updateFloatingConfig(Number(settings.floatingSize) || 56, settings.floatingIcon || ''); } catch (e) { }
        }
        requestAnimationFrame(() => {
            if (fab) {
                const rect = fab.getBoundingClientRect();
                const next = clampPos(rect.left, rect.top);
                if (Math.abs(next.left - rect.left) > .5 || Math.abs(next.top - rect.top) > .5) {
                    fab.style.left = next.left + 'px'; fab.style.top = next.top + 'px';
                    savePos(next.left, next.top);
                }
            }
            if (isExpanded) positionPanel();
        });
    }

    function positionPanel() {
        if (!panel || !fab) return;
        if (EMBED_MODE) return;
        const fr = fab.getBoundingClientRect();
        const pw = panel.offsetWidth || settings.expandedWidth;
        const ph = panel.offsetHeight || settings.expandedHeight;
        const gap = 12;
        let left = fr.left - pw - gap;
        let top = fr.top;
        if (left < 8) { left = Math.max(8, Math.min(window.innerWidth - pw - 8, fr.right - pw)); top = fr.bottom + gap; }
        if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
        if (top < 8) top = 8;
        panel.style.left = left + 'px'; panel.style.top = top + 'px';
    }

    /* ========== 悬浮球 ========== */
    async function createFab() {
        if (document.getElementById('xmp-fab')) return;
        fab = document.createElement('div');
        fab.id = 'xmp-fab';
        fab.title = '音乐播放器';
        fab.tabIndex = 0;
        fab.dataset.theme = settings.theme || 'dark';
        fab.style.width = settings.collapsedSize + 'px';
        fab.style.height = settings.collapsedSize + 'px';
        const pos = await loadPos();
        const clamped = clampPos(pos.left, pos.top);
        fab.style.left = clamped.left + 'px'; fab.style.top = clamped.top + 'px';
        fab.innerHTML = `<div class="xmp-fab-icon">${ICON_MUSIC}</div>`;
        document.body.appendChild(fab);

        let isDragging = false, hasMoved = false, startX = 0, startY = 0, startLeft = 0, startTop = 0, pointerId = null;
        fab.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            const rect = fab.getBoundingClientRect();
            isDragging = true; hasMoved = false; pointerId = e.pointerId;
            startX = e.clientX; startY = e.clientY; startLeft = rect.left; startTop = rect.top;
            try { fab.setPointerCapture(pointerId); } catch (err) { }
            fab.classList.add('dragging');
            if (isExpanded) collapsePanel();
        }, { passive: false });
        fab.addEventListener('pointermove', (e) => {
            if (!isDragging || e.pointerId !== pointerId) return;
            e.preventDefault();
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
            const next = clampPos(startLeft + dx, startTop + dy);
            fab.style.left = next.left + 'px'; fab.style.top = next.top + 'px';
        }, { passive: false });
        function endDrag(e) {
            if (!isDragging) return;
            if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
            isDragging = false;
            fab.classList.remove('dragging');
            try { fab.releasePointerCapture(pointerId); } catch (err) { }
            pointerId = null;
            if (hasMoved) { const rect = fab.getBoundingClientRect(); savePos(rect.left, rect.top); }
            else { if (isExpanded) collapsePanel(); else expandPanel(); }
        }
        fab.addEventListener('pointerup', endDrag);
        fab.addEventListener('pointercancel', endDrag);
        fab.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isExpanded) collapsePanel(); else expandPanel(); }
        });
        window.addEventListener('resize', () => {
            const rect = fab.getBoundingClientRect();
            const next = clampPos(rect.left, rect.top);
            if (Math.abs(next.left - rect.left) > .5 || Math.abs(next.top - rect.top) > .5) {
                fab.style.left = next.left + 'px'; fab.style.top = next.top + 'px';
                savePos(next.left, next.top);
            }
            if (isExpanded) positionPanel();
        });
    }

    /* ========== 面板 ========== */
    /* ========== 网易云导入 ========== */
    GM_addStyle(`
      #xmp-panel .xmp-ncm-progress { margin-top:10px; display:none; }
      #xmp-panel .xmp-ncm-progress-bar { height:4px; border-radius:4px; background:var(--btn-bg); overflow:hidden; }
      #xmp-panel .xmp-ncm-progress-inner { width:0; height:100%; background:var(--fg-1); transition:width .2s; }
      #xmp-panel .xmp-ncm-progress-text { margin-top:7px; font-size:11px; color:var(--fg-2); }
    `);



    /* ============================================================
     *  液态玻璃动效系统（只动 transform / opacity；backdrop-filter 仅用于 导航 / 迷你卡 / 搜索栏 / 提示条）
     * ============================================================ */
    GM_addStyle(`
#xmp-panel{--spring:cubic-bezier(.34,1.56,.64,1);--spring-soft:cubic-bezier(.3,1.15,.4,1);--glass-hi:inset 0 1px 0 rgba(255,255,255,.32),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 0 .5px rgba(255,255,255,.14);}

/* ===== 迷你播放卡：封面→展开，可拖动 ===== */
#xmp-panel .xmp-mini-bar{
  display:flex;left:14px;right:auto;bottom:var(--mini-b,76px);width:62px;height:62px;box-sizing:border-box;padding:10px;gap:10px;
  border-radius:31px;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;
  visibility:hidden;opacity:0;pointer-events:none;
  -webkit-backdrop-filter:blur(var(--card-blur,14px)) saturate(170%);backdrop-filter:blur(var(--card-blur,14px)) saturate(170%);
  box-shadow:var(--glass-hi),0 10px 30px rgba(0,0,0,.35);
  transform:translate3d(var(--dx,0px),var(--dy,0px),0) scale(var(--mini-s,1));transform-origin:left center;
  transition:width .58s var(--spring-soft),transform .32s var(--spring);
  will-change:width,transform;contain:layout style;--pop-x:-34px;--pop-o:4px;
}
#xmp-panel .xmp-mini-bar[data-side="right"]{left:auto;right:14px;flex-direction:row-reverse;transform-origin:right center;--pop-x:34px;--pop-o:-4px;}
#xmp-panel .xmp-mini-bar.show,#xmp-panel .xmp-mini-bar.is-leaving{visibility:visible;opacity:1;}
#xmp-panel .xmp-mini-bar.show{pointer-events:auto;}
#xmp-panel .xmp-mini-bar.is-open{width:calc(100% - 28px);}
#xmp-panel .xmp-mini-bar:active:not(.is-dragging){--mini-s:.975;}
#xmp-panel .xmp-mini-bar.is-dragging{--mini-s:1.07;cursor:grabbing;transition:width .5s var(--spring-soft);box-shadow:var(--glass-hi),0 18px 40px rgba(0,0,0,.45);}
#xmp-panel .xmp-mini-bar.is-grab{transition:width .5s var(--spring-soft),transform .3s var(--spring);}
#xmp-panel .xmp-mini-bar.is-snap{transition:width .58s var(--spring-soft),transform .52s cubic-bezier(.34,1.45,.64,1);}
#xmp-panel .xmp-mini-bar.is-pop{animation:xmp-mini-pop .46s cubic-bezier(.34,1.5,.64,1) backwards;}
#xmp-panel .xmp-mini-bar.is-leaving{animation:xmp-mini-out .28s cubic-bezier(.5,0,.8,.4) forwards;}
@keyframes xmp-mini-pop{
  0%{opacity:0;transform:translate3d(calc(var(--dx,0px) + var(--pop-x)),var(--dy,0px),0) scale(.5);}
  60%{opacity:1;transform:translate3d(calc(var(--dx,0px) + var(--pop-o)),var(--dy,0px),0) scale(1.07);}
  100%{opacity:1;transform:translate3d(var(--dx,0px),var(--dy,0px),0) scale(1);}
}
@keyframes xmp-mini-out{to{opacity:0;transform:translate3d(calc(var(--dx,0px) + var(--pop-x)),var(--dy,0px),0) scale(.5);}}
#xmp-panel .xmp-mini-bar::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,.04) 38%,transparent 62%);}
#xmp-panel .xmp-mini-bar::after{content:'';position:absolute;top:0;bottom:0;left:0;width:60%;pointer-events:none;opacity:0;transform:translate3d(-120%,0,0);background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.3) 50%,transparent 80%);}
#xmp-panel .xmp-mini-bar.is-open::after{animation:xmp-sheen 1s .08s ease-out 1;}
@keyframes xmp-sheen{0%{opacity:1;transform:translate3d(-120%,0,0);}100%{opacity:0;transform:translate3d(260%,0,0);}}
#xmp-panel .xmp-mini-cover{position:relative;transition:transform .5s var(--spring);}
#xmp-panel .xmp-mini-bar.is-dragging .xmp-mini-cover{transform:scale(1.04);}
#xmp-panel .xmp-mini-bar.is-pop .xmp-mini-cover{animation:xmp-cover-in .5s var(--spring) backwards;}
@keyframes xmp-cover-in{from{transform:scale(.7) rotate(-14deg);}to{transform:none;}}
#xmp-panel .xmp-mini-info,#xmp-panel .xmp-mini-play,#xmp-panel .xmp-mini-close{opacity:0;transform:translate3d(-10px,0,0) scale(.92);transition:opacity .2s ease,transform .4s var(--spring);}
#xmp-panel .xmp-mini-bar[data-side="right"] .xmp-mini-info,
#xmp-panel .xmp-mini-bar[data-side="right"] .xmp-mini-play,
#xmp-panel .xmp-mini-bar[data-side="right"] .xmp-mini-close{transform:translate3d(10px,0,0) scale(.92);}
#xmp-panel .xmp-mini-bar.is-open .xmp-mini-info,#xmp-panel .xmp-mini-bar.is-open .xmp-mini-play,#xmp-panel .xmp-mini-bar.is-open .xmp-mini-close{opacity:1;transform:none;}
#xmp-panel .xmp-mini-bar.is-open .xmp-mini-info{transition-delay:.12s;}
#xmp-panel .xmp-mini-bar.is-open .xmp-mini-play{transition-delay:.2s;}
#xmp-panel .xmp-mini-bar.is-open .xmp-mini-close{transition-delay:.27s;}
#xmp-panel .xmp-mini-bar:not(.is-open) .xmp-mini-play,#xmp-panel .xmp-mini-bar:not(.is-open) .xmp-mini-close{pointer-events:none;}
#xmp-panel .xmp-mini-bar.is-open .xmp-mini-play:active,#xmp-panel .xmp-mini-bar.is-open .xmp-mini-close:active{transform:scale(.86);}
#xmp-panel .xmp-mini-play svg,#xmp-panel .xmp-play-btn svg{animation:xmp-icon-pop .42s var(--spring);}
@keyframes xmp-icon-pop{0%{transform:scale(.45) rotate(-30deg);opacity:0;}100%{transform:none;opacity:1;}}

/* ===== 底部导航：玻璃滑块（液态拉伸） ===== */
#xmp-panel .xmp-bottom-nav{-webkit-backdrop-filter:blur(var(--nav-blur,14px)) saturate(170%);backdrop-filter:blur(var(--nav-blur,14px)) saturate(170%);box-shadow:var(--glass-hi),0 8px 28px rgba(0,0,0,.35);}
#xmp-panel .xmp-nav-btn{position:relative;z-index:1;}
#xmp-panel .xmp-nav-lens{position:absolute;top:6px;bottom:6px;left:0;width:var(--lens-w,60px);border-radius:22px;pointer-events:none;z-index:0;opacity:0;transform:translate3d(var(--lens-x,0px),0,0);transition:transform .6s cubic-bezier(.34,1.4,.5,1),opacity .25s ease;will-change:transform;}
#xmp-panel .xmp-nav-lens.on{opacity:1;}
#xmp-panel .xmp-nav-lens i{position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,rgba(255,255,255,.26),rgba(255,255,255,.1));box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(255,255,255,.1),0 3px 12px rgba(0,0,0,.2);}
#xmp-panel .xmp-nav-lens.moving i{animation:xmp-lens-squish .6s cubic-bezier(.3,1.2,.5,1);}
@keyframes xmp-lens-squish{0%{transform:scale(1,1);}35%{transform:scale(1.3,.84);}70%{transform:scale(.96,1.06);}100%{transform:scale(1,1);}}
#xmp-panel .xmp-nav-btn.active svg{animation:xmp-nav-pop .55s var(--spring);}
@keyframes xmp-nav-pop{0%{transform:scale(.7) translateY(3px);}60%{transform:scale(1.18) translateY(-2px);}100%{transform:none;}}

/* ===== 页面切换：缓动缩放 + 淡入 + 内容依次升起 ===== */
#xmp-panel .xmp-view{transition:opacity var(--page-fade,.3s) cubic-bezier(.25,.1,.25,1),transform calc(var(--page-fade,.3s) * 1.4) var(--spring-soft);}
#xmp-panel .xmp-view.is-show{transform:none;}
#xmp-panel .xmp-view.is-leave{transform:scale(.985);}
#xmp-panel .xmp-view.is-enter{transform:scale(1.02);}
#xmp-panel .xmp-stagger .xmp-pl-card,
#xmp-panel .xmp-stagger .xmp-add-section,
#xmp-panel .xmp-stagger .xmp-stats-card,
#xmp-panel .xmp-stagger .xmp-setting-row:nth-child(-n+10),
#xmp-panel .xmp-stagger .xmp-track-item:nth-child(-n+12){animation:xmp-rise .55s cubic-bezier(.22,1,.36,1) backwards;}
#xmp-panel .xmp-stagger :nth-child(2){animation-delay:.04s;}
#xmp-panel .xmp-stagger :nth-child(3){animation-delay:.08s;}
#xmp-panel .xmp-stagger :nth-child(4){animation-delay:.12s;}
#xmp-panel .xmp-stagger :nth-child(5){animation-delay:.16s;}
#xmp-panel .xmp-stagger :nth-child(n+6){animation-delay:.2s;}
@keyframes xmp-rise{from{opacity:0;transform:translate3d(0,14px,0) scale(.97);}to{opacity:1;transform:none;}}

/* ===== 按钮 / 卡片：弹簧按压 + 玻璃高光 ===== */
#xmp-panel .xmp-ctrl-btn,#xmp-panel .xmp-icon-btn,#xmp-panel .xmp-playlist-action,#xmp-panel .xmp-pl-detail-back,#xmp-panel .xmp-hours-back,
#xmp-panel .xmp-footer-btn,#xmp-panel .xmp-add-btn,#xmp-panel .xmp-setting-btn,#xmp-panel .xmp-playlist-pill,#xmp-panel .xmp-track-action,
#xmp-panel .xmp-loop-btn,#xmp-panel .xmp-tab,#xmp-panel .xmp-color-swatch,#xmp-panel .xmp-wall-search-btn,#xmp-panel .xmp-mini-close{
  transition:transform .45s var(--spring),background .18s ease,color .18s ease,opacity .18s ease,border-color .18s ease,box-shadow .25s ease;
}
#xmp-panel .xmp-ctrl-btn:active,#xmp-panel .xmp-icon-btn:active,#xmp-panel .xmp-playlist-action:active,#xmp-panel .xmp-pl-detail-back:active,
#xmp-panel .xmp-footer-btn:active,#xmp-panel .xmp-add-btn:active,#xmp-panel .xmp-setting-btn:active,#xmp-panel .xmp-playlist-pill:active,
#xmp-panel .xmp-track-action:active,#xmp-panel .xmp-loop-btn:active,#xmp-panel .xmp-color-swatch:active,#xmp-panel .xmp-wall-search-btn:active{transform:scale(.9);}
#xmp-panel .xmp-footer-btn,#xmp-panel .xmp-add-btn,#xmp-panel .xmp-setting-btn,#xmp-panel .xmp-ctrl-btn.xmp-play-btn{position:relative;overflow:hidden;}
#xmp-panel .xmp-footer-btn::after,#xmp-panel .xmp-add-btn::after,#xmp-panel .xmp-setting-btn::after,#xmp-panel .xmp-ctrl-btn.xmp-play-btn::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.4),transparent 70%);transition:opacity .3s ease;}
#xmp-panel .xmp-footer-btn:active::after,#xmp-panel .xmp-add-btn:active::after,#xmp-panel .xmp-setting-btn:active::after,#xmp-panel .xmp-ctrl-btn.xmp-play-btn:active::after{opacity:1;transition-duration:.05s;}
#xmp-panel .xmp-footer-btn,#xmp-panel .xmp-add-btn,#xmp-panel .xmp-ctrl-btn.xmp-play-btn{box-shadow:inset 0 1px 0 rgba(255,255,255,.18);}
#xmp-panel .xmp-ctrl-btn.xmp-play-btn{box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 6px 20px rgba(0,0,0,.25);}
#xmp-panel .xmp-pl-card{transition:transform .45s var(--spring),background .2s ease;box-shadow:inset 0 1px 0 rgba(255,255,255,.07);}
#xmp-panel .xmp-pl-card:active{transform:scale(.965);}
#xmp-panel .xmp-track-item{transition:background .15s ease,transform .45s var(--spring);}
#xmp-panel .xmp-track-item:active{transform:scale(.975);}
#xmp-panel .xmp-track-item.current{animation:xmp-glow-in .5s ease;}
@keyframes xmp-glow-in{from{background:var(--accent-soft);}}
#xmp-panel .xmp-loop-btn.active{transform:scale(1.06);}
#xmp-panel .xmp-playlist-pill.active{animation:xmp-icon-pop .4s var(--spring);}
#xmp-panel .xmp-color-swatch.active{animation:xmp-icon-pop .45s var(--spring);}
#xmp-panel .xmp-setting-control input[type="range"]::-webkit-slider-thumb{transition:transform .3s var(--spring),box-shadow .2s ease;background:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 0 0 .5px rgba(0,0,0,.15),0 2px 8px rgba(0,0,0,.3);}
#xmp-panel .xmp-setting-control input[type="range"]:active::-webkit-slider-thumb{transform:scale(1.28);}
#xmp-panel .xmp-add-checkbox input[type="checkbox"]{transition:background .2s ease,border-color .2s ease,transform .4s var(--spring);}
#xmp-panel .xmp-add-checkbox input[type="checkbox"]:active{transform:scale(.85);}

/* ===== 唱片墙搜索栏：玻璃下落 + 聚焦光晕 ===== */
#xmp-panel .xmp-wall-search{-webkit-backdrop-filter:blur(14px) saturate(170%);backdrop-filter:blur(14px) saturate(170%);box-shadow:inset 0 1px 0 rgba(255,255,255,.14);}
#xmp-panel .xmp-wall-search.open{animation:xmp-glass-drop .55s var(--spring);}
@keyframes xmp-glass-drop{from{opacity:0;transform:translate3d(0,-14px,0) scale(.96);}to{opacity:1;transform:none;}}
#xmp-panel .xmp-wall-search-input{transition:border-color .2s ease,box-shadow .3s ease,background .2s ease;}
#xmp-panel .xmp-wall-search-input:focus{box-shadow:0 0 0 3px rgba(10,132,255,.22);background:rgba(255,255,255,.12);}
#xmp-panel .xmp-wall-search-meta{transition:opacity .2s ease;}

/* ===== 面板 / 悬浮球 ===== */
#xmp-panel{transition:opacity .22s ease,transform .5s var(--spring-soft);}
#xmp-fab{transition:transform .45s var(--spring),box-shadow .25s ease;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 20px rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.15);}
#xmp-fab:active{transform:scale(.9);}
#xmp-fab.dragging:active{transform:scale(1.1);}

@media (prefers-reduced-motion:reduce){
  #xmp-panel *,#xmp-panel *::before,#xmp-panel *::after{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important;transition-delay:0s!important;}
}
`);

    /* ========== 唱片墙 ========== */
    function shuffleArr(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function separateSameCovers(items) {
        if (items.length < 2) return items;
        const byKey = new Map();
        for (const it of items) {
            const k = it.coverKey || '_';
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(it);
        }
        const queues = Array.from(byKey.values()).map(q => shuffleArr(q));
        queues.sort((a, b) => b.length - a.length);
        const out = [];
        let guard = 0;
        while (out.length < items.length && guard < items.length * 4) {
            guard++;
            queues.sort((a, b) => b.length - a.length);
            let placed = false;
            for (const q of queues) {
                if (!q.length) continue;
                const last = out[out.length - 1];
                if (last && last.coverKey === q[0].coverKey && queues.some(x => x.length && x[0].coverKey !== last.coverKey)) continue;
                out.push(q.shift());
                placed = true;
                break;
            }
            if (!placed) {
                for (const q of queues) { if (q.length) { out.push(q.shift()); break; } }
            }
        }
        return out;
    }


    function playlistShownOnWall(pl) {
        // 仅明确关闭时隐藏；缺省 / null / undefined / "true" 都展示
        if (!pl) return false;
        if (pl.showOnWall === false || pl.showOnWall === 0 || pl.showOnWall === 'false') return false;
        return true;
    }

    function collectWallItems() {
        const raw = [];
        if (!Array.isArray(playlists)) return raw;
        for (const pl of playlists) {
            if (!pl || !Array.isArray(pl.tracks) || !pl.tracks.length) continue;
            if (!playlistShownOnWall(pl)) continue;
            for (let i = 0; i < pl.tracks.length; i++) {
                const t = pl.tracks[i];
                if (!t || !t.id) continue;
                raw.push({
                    track: t,
                    playlistId: pl.id,
                    index: i,
                    coverKey: (t.cover && String(t.cover).trim()) || ('id:' + t.id)
                });
            }
        }
        try {
            return separateSameCovers(raw);
        } catch (e) {
            console.error('[wall] separate', e);
            return raw;
        }
    }

    function wallSizeVariants(base) {
        const b = Math.max(48, Number(base) || 88);
        return [
            Math.round(b * 0.72),
            Math.round(b * 0.86),
            Math.round(b),
            Math.round(b * 1.14),
            Math.round(b * 1.28)
        ];
    }

    function applyWallCssVars() {
        if (!panel) return;
        const glow = (Number(settings.wallGlow) || 70) / 100;
        const dim = (Number(settings.wallDim) || 55) / 100;
        panel.style.setProperty('--wall-glow', String(8 + glow * 28));
        panel.style.setProperty('--wall-dim', String(dim));
        applyWallEdgeBlur();
    }

    /* 唱片墙边缘由内向外渐进虚化：4 条窄带 backdrop-filter + 渐变遮罩（只覆盖边缘，开销小） */
    function applyWallEdgeBlur() {
        if (!panel) return;
        const blur = Math.max(0, Number(settings.wallEdgeBlur) || 0);
        const fade = Math.max(0, Math.min(100, settings.wallEdgeFade == null ? 50 : Number(settings.wallEdgeFade)));
        const dist = Math.max(10, Number(settings.wallEdgeDist) || 70);
        const els = panel.querySelectorAll('.xmp-wall-edge');
        if (!els.length) return;
        if (blur <= 0) { els.forEach(el => el.classList.remove('on')); return; }
        panel.style.setProperty('--wall-edge-blur', blur + 'px');
        panel.style.setProperty('--wall-edge-dist', dist + 'px');
        // 过渡柔和度：alpha = t^gamma（t: 0=内侧起点 → 1=屏幕边缘），gamma 越大越柔和、越靠近边缘才变糊
        const gamma = 0.45 + (fade / 100) * 2.4;
        const N = 10;
        const mk = (dir) => {
            const st = [];
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                st.push('rgba(0,0,0,' + Math.pow(t, gamma).toFixed(3) + ') ' + (t * 100).toFixed(1) + '%');
            }
            return 'linear-gradient(' + dir + ',' + st.join(',') + ')';
        };
        const dirs = { 'e-t': 'to top', 'e-b': 'to bottom', 'e-l': 'to left', 'e-r': 'to right' };
        els.forEach(el => {
            let g = '';
            for (const k in dirs) if (el.classList.contains(k)) g = mk(dirs[k]);
            el.style.webkitMaskImage = g;
            el.style.maskImage = g;
            el.classList.add('on');
        });
    }

    function layoutWallPositions(items, sizes) {
        // 以 1x1 为网格单位紧密排列；尽量让相邻格尺寸不同，避免同尺寸成片（不加大缝隙）
        const gap = 2;
        const style = settings.wallStyle || 'mixed';
        const unit = Math.max(40, Math.round((sizes[2] || sizes[0] || 88) / 2) * 2);
        const pBig = Math.max(0, Math.min(100, Number(settings.wallBigChance) || 0)) / 100;
        const pH = Math.max(0, Math.min(100, Number(settings.wallRectHChance) || 0)) / 100;
        const pV = Math.max(0, Math.min(100, Number(settings.wallRectVChance) || 0)) / 100;
        function rnd(i, salt) {
            return Math.abs(Math.sin((i + 1) * 12.9898 + salt * 78.13) * 43758.5453) % 1;
        }

        // 先按概率生成尺寸列表，再打散顺序，避免同尺寸在数组里扎堆
        const kinds = [];
        for (let i = 0; i < items.length; i++) {
            if (style === 'uniform') { kinds.push({ kind: '1x1', gw: 1, gh: 1 }); continue; }
            if (style === 'classic') {
                const opts = [{ kind: '1x1', gw: 1, gh: 1 }, { kind: '2x1', gw: 2, gh: 1 }, { kind: '1x2', gw: 1, gh: 2 }];
                kinds.push(opts[Math.floor(rnd(i, 2) * opts.length)]);
                continue;
            }
            const r = rnd(i, 1);
            if (r < pBig) kinds.push({ kind: '3x3', gw: 3, gh: 3 });
            else if (r < pBig + pH) kinds.push({ kind: '2x1', gw: 2, gh: 1 });
            else if (r < pBig + pH + pV) kinds.push({ kind: '1x2', gw: 1, gh: 2 });
            else kinds.push({ kind: '1x1', gw: 1, gh: 1 });
        }
        // 交错重排：大 → 中 → 小轮流取，减少同尺寸连续
        const buckets = { '3x3': [], '2x1': [], '1x2': [], '1x1': [] };
        kinds.forEach((k, i) => {
            const key = buckets[k.kind] ? k.kind : '1x1';
            buckets[key].push({ i: i, kind: k.kind, gw: k.gw, gh: k.gh });
        });
        const orderKeys = ['3x3', '2x1', '1x2', '1x1'];
        const order = [];
        let guard = 0;
        while (order.length < items.length && guard < items.length * 4) {
            guard++;
            let added = false;
            for (const key of orderKeys) {
                if (buckets[key].length) {
                    order.push(buckets[key].shift());
                    added = true;
                }
            }
            if (!added) break;
        }
        // 补漏
        for (const key of orderKeys) while (buckets[key].length) order.push(buckets[key].shift());

        const cell = unit + gap; // 网格步长（含缝，最终视觉仍是紧贴的 gap）
        // 用网格占用表实现紧密无洞放置
        const cols = Math.max(8, Math.ceil(Math.sqrt(items.length * 1.2)) + 4);
        const rows = Math.max(cols * 2, Math.ceil(items.length / 2) + 8);
        const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        const positions = new Array(items.length);

        function fits(gx, gy, gw, gh) {
            if (gx < 0 || gy < 0 || gx + gw > cols || gy + gh > rows) return false;
            for (let y = gy; y < gy + gh; y++)
                for (let x = gx; x < gx + gw; x++)
                    if (grid[y][x] != null) return false;
            return true;
        }
        function mark(gx, gy, gw, gh, id) {
            for (let y = gy; y < gy + gh; y++)
                for (let x = gx; x < gx + gw; x++)
                    grid[y][x] = id;
        }
        // 与已放置块是否「边相邻」且同 kind
        function sameKindEdgeNeighbor(gx, gy, gw, gh, kind) {
            const checks = [];
            for (let x = gx; x < gx + gw; x++) {
                checks.push([x, gy - 1], [x, gy + gh]);
            }
            for (let y = gy; y < gy + gh; y++) {
                checks.push([gx - 1, y], [gx + gw, y]);
            }
            for (const [x, y] of checks) {
                if (y < 0 || x < 0 || y >= rows || x >= cols) continue;
                const id = grid[y][x];
                if (id == null) continue;
                const p = positions[id];
                if (p && p.kind === kind) return true;
            }
            return false;
        }
        // 统计四边相邻中同尺寸数量（用于打分，不留空）
        function sameKindNeighborCount(gx, gy, gw, gh, kind) {
            let n = 0;
            const seen = new Set();
            const checks = [];
            for (let x = gx; x < gx + gw; x++) {
                checks.push([x, gy - 1], [x, gy + gh]);
            }
            for (let y = gy; y < gy + gh; y++) {
                checks.push([gx - 1, y], [gx + gw, y]);
            }
            for (const [x, y] of checks) {
                if (y < 0 || x < 0 || y >= rows || x >= cols) continue;
                const id = grid[y][x];
                if (id == null || seen.has(id)) continue;
                seen.add(id);
                const p = positions[id];
                if (p && p.kind === kind) n++;
            }
            return n;
        }

        let maxRow = 0;
        for (const box of order) {
            let gw = box.gw, gh = box.gh, kind = box.kind;
            let best = null;

            const search = (tgw, tgh, tkind, forbidEdge) => {
                let hit = null;
                for (let gy = 0; gy < rows - tgh + 1; gy++) {
                    for (let gx = 0; gx < cols - tgw + 1; gx++) {
                        if (!fits(gx, gy, tgw, tgh)) continue;
                        if (forbidEdge && sameKindEdgeNeighbor(gx, gy, tgw, tgh, tkind)) continue;
                        const sameN = sameKindNeighborCount(gx, gy, tgw, tgh, tkind);
                        // 紧密：优先靠上靠左；其次减少同尺寸边相邻
                        const score = gy * cols + gx + sameN * 50 + rnd(box.i + gx + gy, 7) * 3;
                        if (!hit || score < hit.score) hit = { gx, gy, gw: tgw, gh: tgh, kind: tkind, score };
                    }
                    // 已找到较优且靠上的解可早停，加速
                    if (hit && hit.gy <= gy && hit.sameN === 0) break;
                }
                return hit;
            };

            // 3x3：禁止与另一 3x3 边相邻（中间会被小块填满，仍紧密）
            if (kind === '3x3') {
                best = search(gw, gh, kind, true);
                if (!best) {
                    // 降级为 1x1，保证能放下
                    gw = 1; gh = 1; kind = '1x1';
                    best = search(1, 1, '1x1', false);
                }
            } else {
                best = search(gw, gh, kind, false);
                // 若同尺寸边相邻过多，尝试换成另一种中等尺寸
                if (best && best.score >= 50 && (kind === '2x1' || kind === '1x2' || kind === '1x1')) {
                    const alt = kind === '2x1' ? [1, 2, '1x2'] : kind === '1x2' ? [2, 1, '2x1'] : [2, 1, '2x1'];
                    const altHit = search(alt[0], alt[1], alt[2], false);
                    if (altHit && altHit.score < best.score) best = altHit;
                }
            }
            if (!best) {
                // 扩列很少见；退化为扫到的第一个空位 1x1
                best = search(1, 1, '1x1', false) || { gx: 0, gy: 0, gw: 1, gh: 1, kind: '1x1' };
            }

            const px = best.gx * cell;
            const py = best.gy * cell;
            const pw = best.gw * unit + (best.gw - 1) * gap;
            const ph = best.gh * unit + (best.gh - 1) * gap;
            positions[box.i] = { left: px, top: py, w: pw, h: ph, kind: best.kind };
            mark(best.gx, best.gy, best.gw, best.gh, box.i);
            if (best.gy + best.gh > maxRow) maxRow = best.gy + best.gh;
        }

        for (let i = 0; i < positions.length; i++) {
            if (!positions[i]) {
                positions[i] = { left: (i % cols) * cell, top: Math.floor(i / cols) * cell, w: unit, h: unit, kind: '1x1' };
            }
        }
        return {
            positions,
            planeW: cols * cell,
            planeH: Math.max(maxRow * cell + unit, 280)
        };
    }

    function scheduleWallDraw() {
        wallNeedsDraw = true;
        if (wallRaf) return;
        wallRaf = xmpRaf(() => {
            wallRaf = 0;
            if (!wallNeedsDraw) return;
            wallNeedsDraw = false;
            drawWallCanvas();
        });
    }

    function setWallDimmed() { scheduleWallDraw(); }

    function clearWallSelectionVisual() {
        if (!wallSelectedId && !wallMatchIds.length) return;
        wallSelectedId = null;
        stopWallGlowAnim();
        scheduleWallDraw();
    }

    function stopWallGlowAnim() {
        if (wallGlowRaf) { cancelAnimationFrame(wallGlowRaf); wallGlowRaf = 0; }
    }

    function startWallGlowAnim() {
        stopWallGlowAnim();
        wallGlowT0 = performance.now();
        let lastDraw = 0;
        const tick = (now) => {
            if (!wallSelectedId && !wallMatchIds.length) { wallGlowRaf = 0; return; }
            // 呼吸光效限制到约 30fps；页面不可见/唱片墙未显示时不重绘
            if (now - lastDraw >= 33) {
                lastDraw = now;
                const v = panel && panel.querySelector('#xmp-view-wall');
                if (!document.hidden && (!v || v.style.display !== 'none')) scheduleWallDraw();
            }
            wallGlowRaf = requestAnimationFrame(tick);
        };
        wallGlowRaf = requestAnimationFrame(tick);
    }

    function drawWallCell(ctx, cell, x, y, w, h, useOrig) {
        const img = cell.img;
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
        else ctx.rect(x, y, w, h);
        ctx.clip();
        if (img && img.complete && img.naturalWidth > 0) {
            // 平时用预缩小的缩略图（画得快），放大查看时才用原图（保证清晰）
            const th = (!useOrig && img.__thumb) ? img.__thumb : null;
            const src = th || img;
            const iw = th ? th.width : img.naturalWidth;
            const ih = th ? th.height : img.naturalHeight;
            const s = Math.max(w / iw, h / ih);
            const dw = iw * s, dh = ih * s;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        } else {
            ctx.fillStyle = '#1c1c1e';
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
    }

    function rebuildWallCache() {
        if (!wallLayout.length || wallPlaneW < 1 || wallPlaneH < 1) {
            wallCache = null;
            return;
        }
        // quick=1x 首屏快；完整=2x 供捏合放大
        const maxSide = 8192;
        const bake = Math.min(arguments[0] ? 1 : 2, maxSide / Math.max(wallPlaneW, wallPlaneH, 1));
        const cw = Math.max(1, Math.ceil(wallPlaneW * bake));
        const ch = Math.max(1, Math.ceil(wallPlaneH * bake));
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext('2d');
        if (!ctx) { wallCache = null; return; }
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, cw, ch);
        ctx.scale(bake, bake);
        for (let i = 0; i < wallLayout.length; i++) {
            const cell = wallLayout[i];
            drawWallCell(ctx, cell, cell.x, cell.y, cell.w, cell.h);
        }
        wallCache = c;
        wallCache._bake = bake;
        wallCacheDirty = false;
    }

    function drawWallCanvas() {
        if (!panel) return;
        const canvas = panel.querySelector('#xmp-wall-canvas');
        const vp = panel.querySelector('#xmp-wall-viewport');
        if (!canvas || !vp) return;
        const vw = vp.clientWidth || 1;
        const vh = vp.clientHeight || 1;
        // 使用设备完整像素比，保证封面清晰
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const bw = Math.floor(vw * dpr), bh = Math.floor(vh * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
            canvas.style.width = vw + 'px';
            canvas.style.height = vh + 'px';
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, vw, vh);
        if (!wallLayout.length) return;

        if (wallCacheDirty || !wallCache) rebuildWallCache();

        const rot = -((Number(settings.wallTilt) || 0) * Math.PI / 180);
        const s = wallScale;
        ctx.save();
        ctx.translate(vw / 2 + wallPanX, vh / 2 + wallPanY);
        ctx.rotate(rot);
        ctx.scale(s, s);
        ctx.translate(-wallPlaneW / 2, -wallPlaneH / 2);

        // 无限平铺 + 视口裁剪：只画真正可见的图块/封面（含倾角后的包围盒）
        const useLive = (wallScale > 1.2 || !wallCache) && !(wallSelectedId || wallMatchIds.length);
        const invS = 1 / s;
        const cs0 = Math.cos(rot), sn0 = Math.sin(rot);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let k = 0; k < 4; k++) {
            const sx = (k & 1) ? vw : 0, sy = (k & 2) ? vh : 0;
            const vx = (sx - vw / 2 - wallPanX) * invS;
            const vy = (sy - vh / 2 - wallPanY) * invS;
            const px = vx * cs0 + vy * sn0 + wallPlaneW / 2;
            const py = -vx * sn0 + vy * cs0 + wallPlaneH / 2;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        const pad = 48;               // 给发光/阴影留余量
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const stepX = wallPlaneW;
        const stepY = wallPlaneH;
        const kx0 = Math.max(-8, Math.floor(minX / stepX)), kx1 = Math.min(8, Math.floor(maxX / stepX));
        const ky0 = Math.max(-8, Math.floor(minY / stepY)), ky1 = Math.min(8, Math.floor(maxY / stepY));
        const tiles = [];
        for (let ty = ky0; ty <= ky1; ty++) {
            for (let tx = kx0; tx <= kx1; tx++) {
                tiles.push([tx * stepX, ty * stepY]);
            }
        }
        const cellVisible = (cell, ox, oy) =>
            cell.x + ox + cell.w >= minX && cell.x + ox <= maxX &&
            cell.y + oy + cell.h >= minY && cell.y + oy <= maxY;

        if (!useLive && wallCache) {
            for (const [ox, oy] of tiles) {
                ctx.drawImage(wallCache, ox, oy, wallPlaneW, wallPlaneH);
            }
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const useOrig = wallScale > 1.2;
            for (const [ox, oy] of tiles) {
                for (let i = 0; i < wallLayout.length; i++) {
                    const cell = wallLayout[i];
                    if (!cellVisible(cell, ox, oy)) continue;
                    drawWallCell(ctx, cell, cell.x + ox, cell.y + oy, cell.w, cell.h, useOrig);
                }
            }
        }

        // 选中/匹配：全图块变暗 + 选中封面发光与标题（所有平铺副本都画）
        const glowIds = new Set();
        if (wallSelectedId != null && wallSelectedId !== '') glowIds.add(String(wallSelectedId));
        for (const id of wallMatchIds) glowIds.add(String(id));
        if (glowIds.size) {
            const t = (performance.now() - wallGlowT0) / 1000;
            const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
            const glowPow = ((Number(settings.wallGlow) || 70) / 100);
            const dim = (Number(settings.wallDim) || 55) / 100;
            const glowCells = [];
            for (let i = 0; i < wallLayout.length; i++) {
                const cell = wallLayout[i];
                if (cell._tid === undefined) cell._tid = String(cell.tid);
                if (glowIds.has(cell._tid)) glowCells.push(cell);
            }
            const dimStyle = 'rgba(0,0,0,' + (0.25 + dim * 0.5) + ')';
            for (const [ox, oy] of tiles) {
                ctx.fillStyle = dimStyle;
                ctx.fillRect(ox - 1, oy - 1, wallPlaneW + 2, wallPlaneH + 2);
                for (let i = 0; i < glowCells.length; i++) {
                    const cell = glowCells[i];
                    if (!cellVisible(cell, ox, oy)) continue;
                    const x = cell.x + ox, y = cell.y + oy, w = cell.w, h = cell.h;
                    // 亮封面
                    ctx.save();
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
                    else ctx.rect(x, y, w, h);
                    ctx.clip();
                    if (cell.img && cell.img.complete && cell.img.naturalWidth > 0) {
                        const iw = cell.img.naturalWidth, ih = cell.img.naturalHeight;
                        const sc = Math.max(w / iw, h / ih);
                        const dw = iw * sc, dh = ih * sc;
                        ctx.drawImage(cell.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
                    } else {
                        ctx.fillStyle = '#2c2c2e';
                        ctx.fillRect(x, y, w, h);
                    }
                    ctx.restore();
                    // 边缘白光
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 + 0.15 * pulse) + ')';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = 'rgba(255,255,255,' + (0.45 + glowPow * 0.5 * pulse) + ')';
                    ctx.shadowBlur = 12 + glowPow * 26 * pulse;
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 8);
                    else ctx.rect(x + 1.5, y + 1.5, w - 3, h - 3);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    // 标题
                    if (cell.title) {
                        const g = ctx.createLinearGradient(x, y + h - 32, x, y + h);
                        g.addColorStop(0, 'rgba(0,0,0,0)');
                        g.addColorStop(1, 'rgba(0,0,0,0.88)');
                        ctx.fillStyle = g;
                        ctx.fillRect(x, y + h - 32, w, 32);
                        ctx.fillStyle = '#fff';
                        ctx.font = '600 12px -apple-system,sans-serif';
                        ctx.textBaseline = 'bottom';
                        const title = cell.title.length > 16 ? cell.title.slice(0, 16) + '…' : cell.title;
                        ctx.fillText(title, x + 6, y + h - 8, w - 12);
                    }
                    ctx.restore();
                }
            }
        }
        ctx.restore();
    }

    /* 唱片墙封面目标像素：按格子最大尺寸 × 设备像素比 × 1.5 余量，限制在 400~800 */
    function wallThumbPx() {
        // 按格子尺寸取略大缩略图即可，避免下过大原图拖慢装载
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = Number(settings.wallCoverSize) || 88;
        const need = Math.round(base * 3 * dpr); // 覆盖 3x3 格仍够用
        return Math.max(160, Math.min(420, Math.round(need / 20) * 20));
    }

    /* 让图床直接返回合适尺寸，而不是下载几MB的原图 */
    function sizedCoverUrl(src, px) {
        if (!src || /^(data|blob|file):/i.test(src)) return src;
        try {
            if (/music\.126\.net|music\.163\.com/i.test(src)) {
                const u = src.replace(/([?&])param=\d+y\d+&?/, '$1').replace(/[?&]$/, '');
                return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'param=' + px + 'y' + px;
            }
            if (/hdslb\.com/i.test(src) && src.indexOf('@') < 0) {
                return src + '@' + px + 'w.jpg';   // 只限宽，保持原图比例，由墙格自己裁切
            }
        } catch (e) { }
        return src;
    }

    /* 非图床缩放的图（如本地图）：加载后预缩小一份，画墙时用它 */
    function wallMakeThumb(img) {
        try {
            const maxCell = Math.round((settings.wallCoverSize || 88) * 1.28 * 1.22);
            const target = maxCell * 2;
            const iw = img.naturalWidth, ih = img.naturalHeight;
            const m = Math.min(iw, ih);
            if (!m || m <= target * 1.25) return;
            const k = target / m;
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(iw * k));
            c.height = Math.max(1, Math.round(ih * k));
            const cx = c.getContext('2d');
            cx.imageSmoothingEnabled = true;
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(img, 0, 0, c.width, c.height);
            img.__thumb = c;
        } catch (e) { }
    }

    function wallPumpLoad() {
        while (wallLoadActive < WALL_LOAD_CONC && wallLoadQ.length) {
            const job = wallLoadQ.shift();
            wallLoadActive++;
            try { job(); } catch (e) { wallLoadActive = Math.max(0, wallLoadActive - 1); }
        }
    }

    function updateWallLoadingUI() {
        if (!panel) return;
        const box = panel.querySelector('#xmp-wall-loading');
        const sub = panel.querySelector('#xmp-wall-loading-sub');
        const fill = panel.querySelector('#xmp-wall-loading-fill');
        const vp = panel.querySelector('#xmp-wall-viewport');
        if (!box) return;
        if (wallReady || wallLoadTotal <= 0) {
            box.classList.remove('show');
            if (vp) vp.classList.remove('is-loading');
            return;
        }
        box.classList.add('show');
        if (vp) vp.classList.add('is-loading');
        const done = Math.min(wallLoadDone, wallLoadTotal);
        const pct = Math.round((done / wallLoadTotal) * 100);
        if (sub) sub.textContent = '已加载封面 ' + done + ' / ' + wallLoadTotal + '（' + pct + '%）\n加载完成前请稍候，暂不可滑动';
        if (fill) fill.style.width = pct + '%';
    }

    function markWallLoadProgress(gen) {
        if (gen !== wallLoadGeneration) return;
        wallLoadDone++;
        updateWallLoadingUI();
        // 过半（按中心优先队列）即可滑动，剩余后台继续补
        const need = wallLoadTotal <= 6 ? wallLoadTotal : Math.ceil(wallLoadTotal * 0.55);
        if (!wallReady && wallLoadDone >= need) {
            wallReady = true;
            updateWallLoadingUI();
            try { scheduleWallBake(); } catch (e) {}
            scheduleWallDraw();
        } else if (wallLoadDone >= wallLoadTotal) {
            wallReady = true;
            updateWallLoadingUI();
            try { scheduleWallBake(); } catch (e) {}
            scheduleWallDraw();
        }
    }

    /* 某张封面到达：只把它补画进整墙缓存，不再整墙重烘焙 */
    function wallOnImgReady(src) {
        try {
            const cells = wallSrcCells.get(src);
            if (cells && wallCache && !wallCacheDirty) {
                const cx = wallCache.getContext('2d');
                if (cx) {
                    const b = wallCache._bake || 1;
                    cx.save();
                    cx.setTransform(b, 0, 0, b, 0, 0);
                    for (const c of cells) drawWallCell(cx, c, c.x, c.y, c.w, c.h, false);
                    cx.restore();
                }
            }
        } catch (e) { }
        if (!wallDrawThrottle) {
            wallDrawThrottle = setTimeout(() => { wallDrawThrottle = 0; scheduleWallDraw(); }, 60);
        }
    }

    function loadWallImage(src) {
        if (!src) return null;
        if (wallImgMap.has(src)) return wallImgMap.get(src);
        const img = new Image();
        img.decoding = 'async';
        wallImgMap.set(src, img);
        const url = sizedCoverUrl(src, wallThumbPx());
        const local = cachedCoverPath(url);
        // 候选顺序：本地缓存 → 缩放后的网络地址 → 原始地址
        const cands = [];
        [local, url, src].forEach(u => { if (u && cands.indexOf(u) < 0) cands.push(u); });
        let ci = 0;
        let queued = false;
        const gen = wallLoadGeneration;
        const finish = (ok) => {
            if (queued) { queued = false; wallLoadActive = Math.max(0, wallLoadActive - 1); wallPumpLoad(); }
            try { markWallLoadProgress(gen); } catch (e) {}
        };
        img.onload = () => {
            finish(true);
            wallMakeThumb(img);
            wallOnImgReady(src);
            if (!local) prefetchCover(url);
        };
        img.onerror = () => {
            ci++;
            if (ci < cands.length) { img.src = cands[ci]; }
            else finish(false);
        };
        try { img.crossOrigin = 'anonymous'; } catch (e) { }
        if (local) {
            img.src = local;                  // 本地文件很快，不排队
        } else {
            queued = true;
            wallLoadQ.push(() => { img.src = cands[0]; });
        }
        return img;
    }

    function buildWallLayout() {
        wallItems = collectWallItems();
        wallLayout = [];
        wallSrcCells = new Map();
        wallCacheDirty = true;
        if (!wallItems.length) {
            wallPlaneW = 1; wallPlaneH = 1;
            wallCache = null;
            return;
        }
        const sizes = wallSizeVariants(settings.wallCoverSize || 88);
        const layout = layoutWallPositions(wallItems, sizes);
        wallPlaneW = Math.max(1, layout.planeW || 280);
        wallPlaneH = Math.max(1, layout.planeH || 280);
        const positions = layout.positions || [];
        for (let i = 0; i < wallItems.length; i++) {
            const it = wallItems[i];
            const p = positions[i] || {
                left: (i % 6) * 80,
                top: Math.floor(i / 6) * 80,
                w: sizes[i % sizes.length],
                h: sizes[i % sizes.length]
            };
            const cell = {
                x: p.left, y: p.top, w: p.w, h: p.h,
                item: it,
                img: null,
                tid: String(it.track.id),
                title: it.track.customTitle || it.track.title || ''
            };
            wallLayout.push(cell);
            const cv = it.track && it.track.cover;
            if (cv) {
                if (!wallSrcCells.has(cv)) wallSrcCells.set(cv, []);
                wallSrcCells.get(cv).push(cell);
            }
        }
        // 全部封面按离中心距离排序加载（非懒加载），并显示进度
        wallLoadGeneration++;
        const gen = wallLoadGeneration;
        wallLoadDone = 0;
        wallLoadTotal = wallSrcCells.size;
        wallReady = wallLoadTotal === 0;
        updateWallLoadingUI();

        const cx = wallPlaneW / 2, cy = wallPlaneH / 2;
        const order = [];
        wallSrcCells.forEach((cells, src) => {
            let d = Infinity;
            for (const c of cells) {
                const dx = c.x + c.w / 2 - cx, dy = c.y + c.h / 2 - cy;
                d = Math.min(d, dx * dx + dy * dy);
            }
            order.push([d, src, cells]);
        });
        order.sort((a, b) => a[0] - b[0]);
        for (const [, src, cells] of order) {
            // 已在内存中的图：直接记进度，不重复下载
            if (wallImgMap.has(src)) {
                const img = wallImgMap.get(src);
                for (const c of cells) c.img = img;
                if (img.complete && img.naturalWidth > 0) {
                    try { markWallLoadProgress(gen); } catch (e) {}
                } else {
                    // 仍在加载中：挂监听一次
                    const once = () => { try { markWallLoadProgress(gen); } catch (e) {} };
                    img.addEventListener('load', once, { once: true });
                    img.addEventListener('error', once, { once: true });
                }
                continue;
            }
            const img = loadWallImage(src);
            for (const c of cells) c.img = img;
        }
        wallPumpLoad();
        // 安全超时：避免个别失败卡住无法滑动
        setTimeout(() => {
            if (gen !== wallLoadGeneration) return;
            if (!wallReady) {
                wallReady = true;
                wallLoadDone = wallLoadTotal;
                updateWallLoadingUI();
                scheduleWallDraw();
            }
        }, 12000);
    }

    function wallSignature() {
        let s = String(settings.wallCoverSize || 88) + '|';
        if (!Array.isArray(playlists)) return s;
        for (let i = 0; i < playlists.length; i++) {
            const pl = playlists[i];
            if (!pl || !playlistShownOnWall(pl)) continue;
            s += (pl.id || i) + ':' + ((pl.tracks && pl.tracks.length) || 0) + ';';
        }
        return s;
    }

    function scheduleWallBake() {
        if (wallBakeTimer) clearTimeout(wallBakeTimer);
        // 先 1x 快速烘焙一帧，再后台补 2x
        wallBakeTimer = setTimeout(() => {
            wallBakeTimer = 0;
            if (!wallLayout.length) return;
            try {
                if (!wallCache) {
                    rebuildWallCache(true);
                    wallCacheDirty = true;
                    scheduleWallDraw();
                    setTimeout(() => {
                        if (!wallLayout.length) return;
                        try { rebuildWallCache(false); scheduleWallDraw(); } catch (e) {}
                    }, 400);
                } else if (wallCacheDirty) {
                    rebuildWallCache(false);
                    scheduleWallDraw();
                }
            } catch (e) { console.error('[wall] bake', e); }
        }, 0);
    }

    function hideWallSurface(hide) {
        if (!panel) return;
        const sels = [
            '#xmp-wall-canvas', '.xmp-wall-canvas', '#xmp-wall', '#xmp-wall-empty',
            '.xmp-wall-layer', '#xmp-wall-wrap', '.xmp-wall-root', '#xmp-wall-scene',
            '#xmp-wall-viewport', '.xmp-wall-canvas-wrap'
        ];
        sels.forEach(s => {
            panel.querySelectorAll(s).forEach(el => {
                if (hide) {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.pointerEvents = 'none';
                    el.setAttribute('data-wall-hidden', '1');
                } else if (el.getAttribute('data-wall-hidden') === '1') {
                    el.style.display = '';
                    el.style.visibility = '';
                    el.style.pointerEvents = '';
                    el.removeAttribute('data-wall-hidden');
                }
            });
        });
        try {
            if (hide) {
                if (typeof wallRaf !== 'undefined' && wallRaf) { cancelAnimationFrame(wallRaf); wallRaf = 0; }
                if (typeof wallAnimRaf !== 'undefined' && wallAnimRaf) { cancelAnimationFrame(wallAnimRaf); wallAnimRaf = 0; }
            }
        } catch (_) {}
    }

    function renderWall(opts) {
        if (!panel) return;
        // 非唱片墙主页时彻底关闭墙画面与计算
        if ((settings.homeMode || 'wall') !== 'wall') {
            try { hideWallSurface(true); } catch (_) {}
            return;
        }
        try { hideWallSurface(false); } catch (_) {}
        const empty = panel.querySelector('#xmp-wall-empty');
        const canvas = panel.querySelector('#xmp-wall-canvas');
        const soft = !!(opts && opts.soft);
        applyWallCssVars();

        const sig = wallSignature();
        // 从其他页回到首页：布局未变则直接贴已有缓存，避免整墙重建卡顿
        if (soft && wallLayout.length && sig === wallLayoutSig && wallCache && !wallCacheDirty) {
            if (empty) empty.style.display = 'none';
            if (canvas) canvas.style.display = 'block';
            try { bindWallPanOnce(); } catch (e) {}
            scheduleWallDraw();
            updateWallSearchMeta();
            return;
        }

        try { buildWallLayout(); } catch (e) { console.error('[wall] layout', e); wallLayout = []; }
        wallLayoutSig = sig;
        if (!wallLayout.length) {
            if (empty) {
                empty.style.display = 'flex';
                const totalTracks = (playlists || []).reduce((n, pl) => n + ((pl && pl.tracks && pl.tracks.length) || 0), 0);
                const hidden = (playlists || []).filter(pl => pl && pl.tracks && pl.tracks.length && !playlistShownOnWall(pl)).length;
                if (!totalTracks) {
                    empty.innerHTML = '还没有歌曲<br>请到「歌单」或「添加」导入音乐';
                } else if (hidden && hidden === (playlists || []).filter(pl => pl && pl.tracks && pl.tracks.length).length) {
                    empty.innerHTML = '歌曲已隐藏出唱片墙<br>请打开歌单详情，勾选「展示在唱片墙」';
                } else {
                    empty.innerHTML = '暂无可展示的歌曲<br>请到「歌单」详情中勾选「展示在唱片墙」';
                }
            }
            if (canvas) canvas.style.display = 'none';
            stopWallGlowAnim();
            wallCache = null;
            wallCacheDirty = false;
        } else {
            if (empty) empty.style.display = 'none';
            if (canvas) canvas.style.display = 'block';
            wallCacheDirty = true;
        }
        if (opts && opts.resetPan) { wallPanX = 0; wallPanY = 0; wallScale = 1; }
        try { bindWallPanOnce(); } catch (e) { console.error('[wall] pan', e); }
        // 先快速画出一帧（可用旧缓存或即时原图），缓存放到下一拍后台烘焙
        scheduleWallDraw();
        updateWallSearchMeta();
    }

    function screenToWall(clientX, clientY) {
        const vp = panel.querySelector('#xmp-wall-viewport');
        if (!vp) return null;
        const rect = vp.getBoundingClientRect();
        let x = clientX - rect.left - (rect.width / 2 + wallPanX);
        let y = clientY - rect.top - (rect.height / 2 + wallPanY);
        const rot = ((Number(settings.wallTilt) || 0) * Math.PI / 180);
        const scale = wallScale;
        x /= scale; y /= scale;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        return { x: rx + wallPlaneW / 2, y: ry + wallPlaneH / 2 };
    }

    function hitTestWall(clientX, clientY) {
        const p = screenToWall(clientX, clientY);
        if (!p || !wallLayout.length) return null;
        let wx = ((p.x % wallPlaneW) + wallPlaneW) % wallPlaneW;
        let wy = ((p.y % wallPlaneH) + wallPlaneH) % wallPlaneH;
        for (let i = wallLayout.length - 1; i >= 0; i--) {
            const c = wallLayout[i];
            if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) return c;
        }
        return null;
    }

    function stopWallInertia() {
        if (wallInertiaRaf) { cancelAnimationFrame(wallInertiaRaf); wallInertiaRaf = 0; }
    }
    function startWallInertia() {
        if (wallInertiaRaf) { cancelAnimationFrame(wallInertiaRaf); wallInertiaRaf = 0; }
        const dur = Math.max(0, Number(settings.wallInertiaMs) || 0);
        if (dur <= 0) { wallVelX = 0; wallVelY = 0; return; }
        let vx = wallVelX, vy = wallVelY;
        if (Math.abs(vx) < 0.35 && Math.abs(vy) < 0.35) { wallVelX = 0; wallVelY = 0; return; }
        const maxV = 56;
        vx = Math.max(-maxV, Math.min(maxV, vx));
        vy = Math.max(-maxV, Math.min(maxV, vy));
        const t0 = performance.now();
        let last = t0;
        const step = (now) => {
            const dt = Math.min(34, Math.max(8, now - last));
            last = now;
            const u = Math.min(1, (now - t0) / dur);
            const speedScale = (1 - u) * (1 - u);
            wallPanX += vx * speedScale * (dt / 16);
            wallPanY += vy * speedScale * (dt / 16);
            scheduleWallDraw();
            if (u < 1) wallInertiaRaf = xmpRaf(step);
            else { wallInertiaRaf = 0; wallVelX = 0; wallVelY = 0; }
        };
        wallInertiaRaf = xmpRaf(step);
    }
    function bindWallPanOnce() {
        if (wallPanBound || !panel) return;
        const vp = panel.querySelector('#xmp-wall-viewport');
        if (!vp) return;
        wallPanBound = true;

        function dist(a, b) {
            const dx = a.x - b.x, dy = a.y - b.y;
            return Math.hypot(dx, dy);
        }
        // 坐标换算为「相对视口中心」，与绘制时 translate(vw/2+pan) 一致
        function relToCenter(x, y) {
            const r = vp.getBoundingClientRect();
            return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
        }
        let pinchStart = null;

        vp.addEventListener('pointerdown', (e) => {
            if (!wallReady) { e.preventDefault(); e.stopPropagation(); return; }
            if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
            stopWallInertia();
            if (wallAnimPan) { cancelAnimationFrame(wallAnimPan); wallAnimPan = null; }
            wallPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            try { vp.setPointerCapture(e.pointerId); } catch (_) {}
            if (wallPointers.size === 1) {
                wallDragging = true;
                wallDragMoved = false;
                wallLastX = e.clientX;
                wallLastY = e.clientY;
                vp.classList.add('is-dragging');
            } else if (wallPointers.size === 2) {
                const pts = [...wallPointers.values()];
                wallPinchStartDist = dist(pts[0], pts[1]) || 1;
                wallPinchStartScale = wallScale;
                wallDragMoved = true;
                // 记录起始双指中心与平移量：缩放时让该点下的内容始终跟随手指中心
                const m = relToCenter((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
                pinchStart = { mx: m.x, my: m.y, px: wallPanX, py: wallPanY };
            }
        });

        vp.addEventListener('pointermove', (e) => {
            if (!wallPointers.has(e.pointerId)) return;
            wallPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (wallPointers.size >= 2) {
                const pts = [...wallPointers.values()];
                const d = dist(pts[0], pts[1]) || 1;
                const next = Math.max(0.55, Math.min(2.4, wallPinchStartScale * (d / wallPinchStartDist)));
                const k = next / wallPinchStartScale;
                const m = relToCenter((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
                if (!pinchStart) pinchStart = { mx: m.x, my: m.y, px: wallPanX, py: wallPanY };
                // 起始中心点下的内容，缩放后落在当前双指中心（同时支持双指拖动平移）
                wallPanX = m.x - k * (pinchStart.mx - pinchStart.px);
                wallPanY = m.y - k * (pinchStart.my - pinchStart.py);
                wallScale = next;
                scheduleWallDraw();
                return;
            }
            if (!wallDragging) return;
            const dx = e.clientX - wallLastX;
            const dy = e.clientY - wallLastY;
            wallLastX = e.clientX;
            wallLastY = e.clientY;
            if (Math.abs(dx) + Math.abs(dy) > 3) {
                if (!wallDragMoved) clearWallSelectionVisual();
                wallDragMoved = true;
            }
            wallPanX += dx;
            wallPanY += dy;
            const now = performance.now();
            const dt = Math.max(8, now - (wallLastMoveT || now));
            wallLastMoveT = now;
            const ix = dx * (16 / dt), iy = dy * (16 / dt);
            wallVelX = wallVelX * 0.2 + ix * 0.8;
            wallVelY = wallVelY * 0.2 + iy * 0.8;
            scheduleWallDraw();
        });

        const end = (e) => {
            wallPointers.delete(e.pointerId);
            if (wallPointers.size < 2) pinchStart = null;
            if (wallPointers.size === 0) {
                wallDragging = false;
                vp.classList.remove('is-dragging');
                setTimeout(() => { wallDragMoved = false; }, 40);
                startWallInertia();
                scheduleWallDraw();
            } else if (wallPointers.size === 1) {
                const remain = [...wallPointers.values()][0];
                wallLastX = remain.x;
                wallLastY = remain.y;
                wallDragging = true;
            }
        };
        vp.addEventListener('pointerup', end);
        vp.addEventListener('pointercancel', end);

        vp.addEventListener('click', (e) => {
            if (wallDragMoved) return;
            const hit = hitTestWall(e.clientX, e.clientY);
            if (hit) onWallLayoutClick(hit);
        });

        // 阻止页面默认捏合
        vp.addEventListener('gesturestart', (e) => e.preventDefault());
        vp.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.94 : 1.06;
            const ns = Math.max(0.55, Math.min(2.4, wallScale * factor));
            const k = ns / wallScale;
            const f = relToCenter(e.clientX, e.clientY);   // 以鼠标位置为焦点
            wallPanX = f.x - k * (f.x - wallPanX);
            wallPanY = f.y - k * (f.y - wallPanY);
            wallScale = ns;
            scheduleWallDraw();
        }, { passive: false });

        window.addEventListener('resize', () => {
            if (panel && panel.querySelector('#xmp-view-wall') &&
                panel.querySelector('#xmp-view-wall').style.display !== 'none') {
                scheduleWallDraw();
            }
        });
    }

    function onWallLayoutClick(cell, keepMatches) {
        if (!cell || !cell.item) return;
        const it = cell.item;
        const pl = playlists.find(p => p.id === it.playlistId);
        if (!pl || !playlistShownOnWall(pl) || !pl.tracks[it.index]) return;
        // 先出选中光效，再异步起播，避免切歌卡死画面
        wallSelectedId = String(it.track.id);
        if (!keepMatches) {
            wallMatchIds = [];
            wallMatchIdx = -1;
        }
        startWallGlowAnim();
        scheduleWallDraw();
        currentPlaylistId = it.playlistId;
        currentTrackIndex = it.index;
        miniBarVisible = true;
        try { updateMiniBar(); } catch (_) {}
        const track = pl.tracks[it.index];
        requestAnimationFrame(() => {
            try { saveState(); } catch (_) {}
            playTrack(track);
        });
    }

    function onWallItemClick(el) {
        if (!el) return;
        const tid = el.dataset && el.dataset.tid;
        const cell = wallLayout.find(c => c.tid === tid);
        if (cell) onWallLayoutClick(cell);
    }

    function closeMiniBarAndStop() {
        miniBarVisible = false;
        try {
            if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
        } catch (_) {}
        isPlaying = false;
        currentTrack = null;
        try { endListenSession(); } catch (_) {}
        try { updatePlayButton(); } catch (_) {}
        try { updateFabIcon(); } catch (_) {}
        try { updateVinylSpin(false); } catch (_) {}
        try { notifyNativePlayState(); } catch (_) {}
        updateMiniBar();
        try { updateNowPlayingUI(); } catch (_) {}
    }

    function updateMiniBar() {
        if (!panel) return;
        const bar = panel.querySelector('#xmp-mini-bar');
        const title = panel.querySelector('#xmp-mini-title');
        const sub = panel.querySelector('#xmp-mini-sub');
        const cover = panel.querySelector('#xmp-mini-cover');
        const playBtn = panel.querySelector('#xmp-mini-play');
        if (!bar) return;
        const show = miniBarVisible && !!currentTrack;
        setMiniVisible(bar, show);
        if (!show) return;
        if (title) title.textContent = currentTrack.customTitle || currentTrack.title || '未知';
        if (sub) sub.textContent = currentTrack.source || currentTrack.artist || '';
        if (cover) {
            if (currentTrack.cover) {
                const src = resolveCoverSrc(currentTrack.cover) || currentTrack.cover;
                cover.innerHTML = '<img src="' + escHtml(src) + '" alt="" referrerpolicy="no-referrer">';
            } else {
                cover.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:.4">' + ICON_MUSIC + '</div>';
            }
        }
        if (playBtn) {
            const st = isPlaying ? '1' : '0';
            if (playBtn.dataset.st !== st) { playBtn.dataset.st = st; playBtn.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY; }
        }
    }

    /* ---- 迷你播放卡片：封面先从端点出现 → 展开；拖动时收缩为封面，松手按落点决定展开方向 ---- */
    let miniShown = false, miniOpenTimer = 0, miniHideTimer = 0, miniSuppressUntil = 0;
    function applyMiniPos(bar) {
        bar.dataset.side = settings.miniSide === 'right' ? 'right' : 'left';
        const b = Number(settings.miniBottom);
        bar.style.setProperty('--mini-b', (isFinite(b) && b >= 76 ? b : 76) + 'px');
    }
    function setMiniVisible(bar, show) {
        if (show === miniShown) return;
        miniShown = show;
        clearTimeout(miniOpenTimer); clearTimeout(miniHideTimer);
        if (show) {
            applyMiniPos(bar);
            bar.style.setProperty('--dx', '0px'); bar.style.setProperty('--dy', '0px');
            bar.classList.remove('is-leaving', 'is-open', 'is-dragging', 'is-snap', 'is-grab');
            void bar.offsetWidth;
            bar.classList.add('show', 'is-pop');
            miniOpenTimer = setTimeout(() => bar.classList.add('is-open'), 300);
            setTimeout(() => bar.classList.remove('is-pop'), 520);
        } else {
            bar.classList.remove('is-open');
            miniHideTimer = setTimeout(() => {
                bar.classList.remove('show', 'is-pop');
                bar.classList.add('is-leaving');
                miniHideTimer = setTimeout(() => bar.classList.remove('is-leaving'), 280);
            }, 380);
        }
    }
    function bindMiniBarDrag(bar) {
        const PILL = 62;
        let armed = false, dragging = false, pid = null, sx = 0, sy = 0;
        let pr = null, baseL = 0, baseT = 0, px = 0, py = 0, raf = 0;
        // 拖动后吞掉紧随其后的 click（否则会误触打开歌词页 / 播放键）
        bar.addEventListener('click', (e) => {
            if (performance.now() < miniSuppressUntil) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
        let longT = 0, longFired = false;
        bar.addEventListener('pointerdown', (e) => {
            if (e.button != null && e.button !== 0) return;
            if (!bar.classList.contains('is-open')) return;
            armed = true; dragging = false; longFired = false; pid = e.pointerId; sx = e.clientX; sy = e.clientY;
            clearTimeout(longT);
            longT = setTimeout(() => {
                if (!armed || dragging) return;
                longFired = true;
                // 首页唱片墙上定位当前播放曲目
                if (currentAppView === 'home' || currentAppView === 'search') {
                    if (currentTrack && currentTrack.id) {
                        try {
                            switchAppView('home');
                            panToWallTrack(currentTrack.id, false);
                            try { hapticLight(); } catch (_) {}
                            showToast('已定位到当前曲目');
                        } catch (err) { console.warn(err); }
                    }
                }
            }, 520);
        });
        const apply = () => {
            raf = 0;
            if (!dragging || !pr) return;
            const cx = Math.max(PILL / 2 + 6, Math.min(pr.width - PILL / 2 - 6, px - pr.left));
            const cy = Math.max(PILL / 2 + 8, Math.min(pr.height - PILL / 2 - 8, py - pr.top));
            bar.style.setProperty('--dx', (cx - (baseL + PILL / 2)) + 'px');
            bar.style.setProperty('--dy', (cy - (baseT + PILL / 2)) + 'px');
        };
        bar.addEventListener('pointermove', (e) => {
            if (!armed || e.pointerId !== pid) return;
            px = e.clientX; py = e.clientY;
            if (!dragging) {
                if (Math.hypot(px - sx, py - sy) < 8) return;
                clearTimeout(longT);
                if (longFired) return;
                dragging = true;
                try { bar.setPointerCapture(pid); } catch (_) {}
                pr = panel.getBoundingClientRect();
                const bottom = parseFloat(bar.style.getPropertyValue('--mini-b')) || 76;
                baseL = bar.dataset.side === 'right' ? pr.width - 14 - PILL : 14;
                baseT = pr.height - bottom - PILL;
                clearTimeout(miniOpenTimer);
                bar.classList.remove('is-open', 'is-snap');
                bar.classList.add('is-dragging', 'is-grab');   // 收缩为封面，并平滑“吸”到指尖
                setTimeout(() => bar.classList.remove('is-grab'), 340);
                try { hapticLight(); } catch (_) {}
            }
            if (!raf) raf = requestAnimationFrame(apply);
        });
        const end = (e) => {
            if (!armed || (e && e.pointerId !== pid)) return;
            armed = false;
            clearTimeout(longT);
            if (longFired) { longFired = false; return; }
            if (!dragging) return;
            dragging = false;
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            miniSuppressUntil = performance.now() + 450;
            try { bar.releasePointerCapture(pid); } catch (_) {}
            const r0 = bar.getBoundingClientRect();
            pr = panel.getBoundingClientRect();
            const centerX = r0.left + r0.width / 2 - pr.left;
            const side = centerX < pr.width / 2 ? 'left' : 'right';      // 靠左 → 向右展开；靠右 → 向左展开
            const bottom = Math.round(Math.max(76, Math.min(pr.height - PILL - 60, pr.bottom - r0.bottom)));
            settings.miniSide = side; settings.miniBottom = bottom;
            try { saveSettings(); } catch (_) {}
            // FLIP：先切换锚点并用偏移抵消，保证视觉位置不跳变，再弹簧滑到贴边位置
            bar.dataset.side = side;
            bar.style.setProperty('--mini-b', bottom + 'px');
            const nl = pr.left + (side === 'left' ? 14 : pr.width - 14 - PILL);
            const nt = pr.bottom - bottom - PILL;
            bar.style.setProperty('--dx', (r0.left - nl) + 'px');
            bar.style.setProperty('--dy', (r0.top - nt) + 'px');
            void bar.offsetWidth;
            bar.classList.remove('is-dragging', 'is-grab');
            bar.classList.add('is-snap');
            bar.style.setProperty('--dx', '0px');
            bar.style.setProperty('--dy', '0px');
            miniOpenTimer = setTimeout(() => {
                bar.classList.add('is-open');
                setTimeout(() => bar.classList.remove('is-snap'), 650);
            }, 320);
        };
        bar.addEventListener('pointerup', end);
        bar.addEventListener('pointercancel', end);
    }

    /* ---- 底部导航“液态玻璃”滑块 ---- */
    function updateNavLens() {
        const nav = panel && panel.querySelector('#xmp-bottom-nav');
        const lens = nav && nav.querySelector('.xmp-nav-lens');
        if (!lens) return;
        const act = nav.querySelector('.xmp-nav-btn.active');
        if (!act || !act.offsetWidth) { lens.classList.remove('on'); return; }
        const x = act.offsetLeft + 3, w = act.offsetWidth - 6;
        const first = !lens.classList.contains('on');
        const changed = lens.dataset.x !== String(x);
        lens.dataset.x = String(x);
        lens.style.setProperty('--lens-w', w + 'px');
        if (first) lens.style.transition = 'none';
        lens.style.setProperty('--lens-x', x + 'px');
        if (first) { void lens.offsetWidth; lens.style.transition = ''; }
        lens.classList.add('on');
        if (changed && !first) {
            lens.classList.remove('moving'); void lens.offsetWidth; lens.classList.add('moving');
        }
    }
    function bindNavLens() {
        const nav = panel.querySelector('#xmp-bottom-nav');
        if (!nav) return;
        let r = 0;
        const sched = () => { if (r) return; r = requestAnimationFrame(() => { r = 0; updateNavLens(); }); };
        const mo = new MutationObserver(sched);
        nav.querySelectorAll('.xmp-nav-btn').forEach(b => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));
        if (window.ResizeObserver) new ResizeObserver(sched).observe(nav);
        sched();
    }

    function animateWallPanTo(tx, ty, ms, ts) {
        if (wallAnimPan) cancelAnimationFrame(wallAnimPan);
        const sx = wallPanX, sy = wallPanY;
        const ss = wallScale;
        const targetScale = (ts != null && isFinite(ts)) ? ts : wallScale;
        const dur = Math.max(160, ms || 320);
        const t0 = performance.now();
        try { stopWallInertia(); } catch (e) {}
        const step = (now) => {
            const k = Math.min(1, (now - t0) / dur);
            const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
            wallPanX = sx + (tx - sx) * e;
            wallPanY = sy + (ty - sy) * e;
            wallScale = ss + (targetScale - ss) * e;
            scheduleWallDraw();
            if (k < 1) wallAnimPan = xmpRaf(step);
            else {
                wallAnimPan = null;
                wallPanX = tx; wallPanY = ty; wallScale = targetScale;
                scheduleWallDraw();
            }
        };
        wallAnimPan = xmpRaf(step);
    }

    /* 镜头动画：把平面点 (cx,cy)（相对墙中心）最终钉在屏幕 focus 点上。
     * 过程中「焦点下的平面点」从当前位置平滑移动到目标，缩放按对数插值（手感均匀）。
     * dipScale 有值时：先拉远（缩小唱片墙）→ 平移 → 再推近聚焦（结果→结果切换）。 */
    function animateWallFocusTo(cx, cy, targetScale, ms, focusX, focusY, dipScale) {
        if (wallAnimPan) cancelAnimationFrame(wallAnimPan);
        const vp = panel && panel.querySelector('#xmp-wall-viewport');
        const vw = vp ? vp.clientWidth : (window.innerWidth || 360);
        const vh = vp ? vp.clientHeight : (window.innerHeight || 640);
        const fx = (focusX != null) ? focusX : vw / 2;
        const fy = (focusY != null) ? focusY : vh / 2;
        const ss = wallScale || 1;
        const ts = Math.max(0.55, Math.min(2.4, targetScale || 1));
        const dur = Math.max(180, ms || 420);
        const rot = -((Number(settings.wallTilt) || 0) * Math.PI / 180);
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        // 当前落在焦点处的平面点（与 drawWallCanvas 的变换互逆）
        const vx0 = (fx - vw / 2 - wallPanX) / ss;
        const vy0 = (fy - vh / 2 - wallPanY) / ss;
        const c0x = vx0 * cosR + vy0 * sinR;
        const c0y = -vx0 * sinR + vy0 * cosR;
        const ln0 = Math.log(ss), ln1 = Math.log(ts);
        const dip = (dipScale && dipScale > 0)
            ? Math.max(0, Math.min(ln0, ln1) - Math.log(dipScale)) : 0;
        const t0 = performance.now();
        try { stopWallInertia(); } catch (e) {}
        const apply = (px, py, sc) => {
            const rx = px * cosR - py * sinR;
            const ry = px * sinR + py * cosR;
            wallScale = sc;
            wallPanX = fx - vw / 2 - sc * rx;
            wallPanY = fy - vh / 2 - sc * ry;
        };
        const step = (now) => {
            const k = Math.min(1, (now - t0) / dur);
            const eS = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
            // 有拉远时位移集中在中段（画面缩到最小时移动最多），更像真实镜头
            const eP = dip
                ? (k < 0.5 ? 16 * Math.pow(k, 5) : 1 - Math.pow(-2 * k + 2, 5) / 2)
                : eS;
            const ln = ln0 + (ln1 - ln0) * eS - dip * Math.sin(Math.PI * k);
            if (k < 1) {
                apply(c0x + (cx - c0x) * eP, c0y + (cy - c0y) * eP, Math.exp(ln));
                scheduleWallDraw();
                wallAnimPan = xmpRaf(step);
            } else {
                wallAnimPan = null;
                apply(cx, cy, ts);
                scheduleWallDraw();
            }
        };
        wallAnimPan = xmpRaf(step);
    }

    function panToWallTrack(tid, play) {
        const cell = wallLayout.find(c => String(c.tid) === String(tid));
        if (!cell) return;
        const vp = panel && panel.querySelector('#xmp-wall-viewport');
        const vw = vp ? vp.clientWidth : (window.innerWidth || 360);
        const vh = vp ? vp.clientHeight : (window.innerHeight || 640);
        // 放大：封面约占短边 52%
        const targetScale = Math.max(1.2, Math.min(2.4, (Math.min(vw, vh) * 0.52) / Math.max(cell.w, cell.h, 1)));
        // 封面中心：水平正中，竖直略偏上（约 38% 高度，即中间靠上）
        const focusX = vw / 2;
        const focusY = vh * 0.38;
        let cx = (cell.x + cell.w / 2) - wallPlaneW / 2;
        let cy = (cell.y + cell.h / 2) - wallPlaneH / 2;
        {   // 无限平铺：选离当前焦点最近的那一份副本，避免长距离飞行
            const rot = -((Number(settings.wallTilt) || 0) * Math.PI / 180);
            const cs = Math.cos(rot), sn = Math.sin(rot);
            const sc = wallScale || 1;
            const vx = (focusX - vw / 2 - wallPanX) / sc;
            const vy = (focusY - vh / 2 - wallPanY) / sc;
            const ux = vx * cs + vy * sn;
            const uy = -vx * sn + vy * cs;
            if (wallPlaneW > 0) cx += Math.round((ux - cx) / wallPlaneW) * wallPlaneW;
            if (wallPlaneH > 0) cy += Math.round((uy - cy) / wallPlaneH) * wallPlaneH;
        }
        const speed = Math.max(20, Number(settings.wallScrollSpeed) || 50);
        let dur = Math.round(560 * (100 / speed));
        // 已聚焦在另一张封面上 → 先拉远整面墙，平移过去，再推近聚焦
        const hadFocus = wallSelectedId != null && wallSelectedId !== '' &&
            String(wallSelectedId) !== String(tid) && (wallScale || 1) > 1.05;
        if (hadFocus) dur = Math.round(dur * 1.75);
        animateWallFocusTo(cx, cy, targetScale, dur, focusX, focusY, hadFocus ? 0.62 : 0);
        wallSelectedId = String(tid);
        startWallGlowAnim();
        scheduleWallDraw();
        if (play) {
            const c2 = wallLayout.find(c => String(c.tid) === String(tid));
            if (c2) onWallLayoutClick(c2, true);   // 保留搜索结果列表，箭头才能继续翻页
        }
    }

    function setWallSearchOpen(open) {
        wallSearchOpen = !!open;
        const bar = panel && panel.querySelector('#xmp-wall-search');
        if (bar) bar.classList.toggle('open', wallSearchOpen);
        if (!wallSearchOpen) {
            wallSearchQuery = '';
            wallMatchIds = [];
            wallMatchIdx = -1;
            const input = panel && panel.querySelector('#xmp-wall-search-input');
            if (input) input.value = '';
            clearWallSelectionVisual();
            updateWallSearchMeta();
            if (Math.abs((wallScale || 1) - 1) > 0.04) {
                const k = 1 / (wallScale || 1);
                animateWallPanTo(wallPanX * k, wallPanY * k, 380, 1);
            } else {
                scheduleWallDraw();
            }
        } else {
            const input = panel && panel.querySelector('#xmp-wall-search-input');
            if (input) setTimeout(() => input.focus(), 50);
        }
    }

    function runWallSearch(q) {
        wallSearchQuery = String(q || '').trim().toLowerCase();
        wallMatchIds = [];
        wallMatchIdx = -1;
        if (!wallSearchQuery) {
            scheduleWallDraw();
            updateWallSearchMeta();
            return;
        }
        for (const it of wallItems) {
            const t = it.track;
            if (it.__hay === undefined) {
                it.__hay = [t.customTitle || t.title || '', t.source || '', t.artist || '', t.fileName || '']
                    .join('\u0001').toLowerCase();
            }
            if (it.__hay.includes(wallSearchQuery)) wallMatchIds.push(t.id);
        }
        if (wallMatchIds.length) {
            wallMatchIdx = 0;
            focusWallMatch(0, false);
        } else {
            scheduleWallDraw();
        }
        updateWallSearchMeta();
    }

    function updateWallSearchMeta() {
        const meta = panel && panel.querySelector('#xmp-wall-search-meta');
        if (!meta) return;
        if (!wallSearchQuery) { meta.textContent = ''; return; }
        if (!wallMatchIds.length) { meta.textContent = '0'; return; }
        meta.textContent = (wallMatchIdx + 1) + '/' + wallMatchIds.length;
    }

    function focusWallMatch(idx, play) {
        if (!wallMatchIds.length) return;
        wallMatchIdx = ((idx % wallMatchIds.length) + wallMatchIds.length) % wallMatchIds.length;
        const tid = wallMatchIds[wallMatchIdx];
        updateWallSearchMeta();
        panToWallTrack(tid, !!play);
    }

    function wallSearchPrev() {
        if (!wallMatchIds.length) return;
        focusWallMatch(wallMatchIdx - 1, true);
    }
    function wallSearchNext() {
        if (!wallMatchIds.length) return;
        focusWallMatch(wallMatchIdx + 1, true);
    }

    function playWallFallThen(cb) {
        const canvas = panel && panel.querySelector('#xmp-wall-canvas');
        if (canvas) {
            canvas.style.transition = 'opacity .4s ease, transform .4s ease';
            canvas.style.opacity = '0';
            canvas.style.transform = 'translateY(36px) scale(0.96)';
            setTimeout(() => {
                canvas.style.transition = '';
                canvas.style.opacity = '';
                canvas.style.transform = '';
                if (cb) cb();
            }, 420);
        } else if (cb) cb();
    }

    function viewDisplayFor(id) {
        if (id === 'wall' || id === 'playlist') return 'flex';
        return 'flex';
    }

    function showViewInstant(id) {
        ['player', 'playlist', 'add', 'settings', 'wall', 'search'].forEach(v => {
            const el = panel.querySelector('#xmp-view-' + v);
            if (!el) return;
            el.style.animation = 'none';
            if (v === id) {
                el.style.display = viewDisplayFor(v);
                el.classList.remove('is-enter', 'is-leave');
                el.classList.add('is-show');
                el.style.zIndex = '2';
            } else {
                el.style.display = 'none';
                el.classList.remove('is-show', 'is-enter', 'is-leave');
                el.style.zIndex = '1';
            }
        });
    }

    function transitionToView(targetId, afterShow) {
        if (!panel) return;
        const ids = ['player', 'playlist', 'add', 'settings', 'wall', 'search'];
        const next = panel.querySelector('#xmp-view-' + targetId);
        const prev = ids.map(v => panel.querySelector('#xmp-view-' + v)).find(el => {
            if (!el || el === next) return false;
            if (el.style.display === 'none') return false;
            return el.classList.contains('is-show') || el.style.display !== 'none';
        });
        const fade = Math.max(150, Number(settings.pageFadeMs) || 300);
        if (panel) panel.style.setProperty('--page-fade', (fade / 1000) + 's');
        hapticLight();
        if (!next) return;
        if (viewAnimLock || !prev || prev === next) {
            showViewInstant(targetId);
            if (afterShow) afterShow();
            return;
        }
        viewAnimLock = true;
        next.style.display = viewDisplayFor(targetId);
        next.classList.remove('is-show', 'is-leave', 'is-enter');
        next.style.opacity = '0';
        next.style.zIndex = '7';
        prev.classList.remove('is-show', 'is-enter');
        prev.classList.add('is-leave');
        prev.style.zIndex = '6';
        void next.offsetWidth;
        requestAnimationFrame(() => {
            next.style.transition = 'opacity ' + (fade / 1000) + 's ease';
            next.style.opacity = '1';
            next.classList.add('is-show');
        });
        setTimeout(() => {
            prev.style.display = 'none';
            prev.classList.remove('is-leave');
            prev.style.zIndex = '1';
            // 下页 0.3s 渐显
            next.classList.remove('is-enter');
            next.classList.add('is-show', 'xmp-stagger');
            setTimeout(() => next.classList.remove('xmp-stagger'), 900);
            setTimeout(() => {
                next.style.zIndex = '2';
                viewAnimLock = false;
                if (afterShow) afterShow();
            }, fade);
        }, fade);
    }

    function switchAppView(view) {
        if (!panel) return;
        currentAppView = view;
        const map = {
            home: 'wall',
            playlist: 'playlist',
            settings: 'settings',
            personal: 'playlist',
            player: 'player',
            add: 'add',
            search: 'search'
        };
        panel.querySelectorAll('.xmp-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view));

        if (view === 'wallpick') {
            if ((settings.homeMode || 'wall') !== 'wall') {
                showToast('仅唱片墙模式可用');
                switchAppView('home');
                return;
            }
            switchAppView('home');
            setWallSearchOpen(true);
            panel.querySelectorAll('.xmp-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === 'wallpick'));
            currentAppView = 'wallpick';
            return;
        }
        if (view === 'search') {
            setWallSearchOpen(false);
            transitionToView('search', () => { try { focusCloudSearch(); } catch (_) {} });
            currentAppView = 'search';
            return;
        }

        if (view === 'home') {
            setWallSearchOpen(false);
            panel.querySelectorAll('.xmp-tab').forEach(t => t.classList.remove('active'));
            const hm = settings.homeMode || 'wall';
            panel.classList.toggle('ipod-mode', hm === 'ipod');
            if (hm === 'carousel') {
                try { hideWallSurface(true); } catch (_) {}
                transitionToView('wall', () => {
                    try { renderCarouselHome(); } catch (e) { console.error(e); }
                    try { updateMiniBar(); } catch (e) { }
                });
                return;
            }
            if (hm === 'ipod') {
                try { hideWallSurface(true); } catch (_) {}
                transitionToView('wall', () => {
                    try { renderIpodHome(); } catch (e) { console.error(e); }
                    try { updateMiniBar(); } catch (e) { }
                });
                return;
            }
            // wall default
            const car = panel.querySelector('#xmp-carousel-home');
            const ipod = panel.querySelector('#xmp-ipod-home');
            if (car) car.classList.remove('show');
            if (ipod) ipod.classList.remove('show');
            transitionToView('wall', () => {
                try {
                    if (wallSettingsDirty) {
                        wallSettingsDirty = false;
                        wallLayoutSig = '';
                        renderWall({ soft: false, resetPan: false });
                    } else {
                        renderWall({ soft: true, resetPan: false });
                    }
                } catch (e) { console.error(e); }
                try { updateMiniBar(); } catch (e) { }
            });
            return;
        }

        if (view === 'personal') {
            wallFallToPersonal();
            return;
        }

        setWallSearchOpen(false);
        const target = map[view] || view;
        transitionToView(target, () => {
            if (target === 'playlist') {
                if (view === 'personal') {
                    openPlaylistDetail(STATS_PLAYLIST_ID);
                } else {
                    setPlaylistPageMode('list');
                    renderPlaylistTabs();
                }
            }
            if (target === 'settings') renderSettingsUI();
            if (target === 'player') { updateNowPlayingUI(); updatePlayButton(); updateLoopModeUI(); }
            updateMiniBar();
        });
    }

    function wallFallToPersonal() {
        const wallVisible = panel.querySelector('#xmp-view-wall');
        const isWall = wallVisible && wallVisible.style.display !== 'none';
        const go = () => {
            setWallSearchOpen(false);
            ['player', 'playlist', 'add', 'settings', 'wall', 'search'].forEach(v => {
                const el = panel.querySelector('#xmp-view-' + v);
                if (el) el.style.display = v === 'playlist' ? '' : 'none';
            });
            openPlaylistDetail(STATS_PLAYLIST_ID);
            updateMiniBar();
        };
        if (isWall) playWallFallThen(go);
        else go();
    }

    function createPanel() {
        if (document.getElementById('xmp-panel')) return;
        panel = document.createElement('div');
        panel.id = 'xmp-panel';
        panel.dataset.theme = settings.theme || 'dark';
        panel.classList.toggle('theme-black-default', (settings.theme || 'dark') === 'black');
        panel.setAttribute('role', 'dialog');
        panel.innerHTML = `
<div class="xmp-bg-layer"><div class="xmp-bg-image"></div><div class="xmp-bg-dim"></div></div>
<div class="xmp-header" id="xmp-header">
<div class="xmp-title">${ICON_MUSIC} 音乐播放器</div>
<div class="xmp-header-actions">
<button type="button" class="xmp-icon-btn" id="xmp-settings-btn" title="设置">⚙</button>
<button type="button" class="xmp-icon-btn" id="xmp-close-btn" title="收起">✕</button>
</div>
</div>
<div class="xmp-tabs">
<button type="button" class="xmp-tab" data-view="player">播放器</button>
<button type="button" class="xmp-tab" data-view="playlist">歌单</button>
<button type="button" class="xmp-tab" data-view="add">添加</button>
<button type="button" class="xmp-tab" data-view="settings">设置</button>
</div>
<div class="xmp-view xmp-view-wall" id="xmp-view-wall">
<div class="xmp-wall-view">
<div class="xmp-wall-search" id="xmp-wall-search">
<button type="button" class="xmp-wall-search-btn" id="xmp-wall-prev" title="上一个">‹</button>
<div class="xmp-wall-search-field"><input type="text" class="xmp-wall-search-input" id="xmp-wall-search-input" placeholder="搜索全部歌曲" autocomplete="off"><span class="xmp-wall-search-meta" id="xmp-wall-search-meta"></span></div>
<button type="button" class="xmp-wall-search-btn" id="xmp-wall-next" title="下一个">›</button>
</div>
<div class="xmp-wall-viewport" id="xmp-wall-viewport">
<div class="xmp-wall-empty" id="xmp-wall-empty">暂无歌曲封面<br>请到「歌单」或「添加」导入音乐</div>
<canvas class="xmp-wall-canvas" id="xmp-wall-canvas"></canvas>
<div class="xmp-wall-edge e-t"></div><div class="xmp-wall-edge e-b"></div><div class="xmp-wall-edge e-l"></div><div class="xmp-wall-edge e-r"></div>
<div class="xmp-wall-loading" id="xmp-wall-loading">
<div class="xmp-wall-loading-title">正在装载唱片墙</div>
<div class="xmp-wall-loading-sub" id="xmp-wall-loading-sub">准备中…</div>
<div class="xmp-wall-loading-bar"><div class="xmp-wall-loading-fill" id="xmp-wall-loading-fill"></div></div>
</div>
</div>
</div>
</div>
<div class="xmp-view" id="xmp-view-player" style="display:none">
<div class="xmp-player xmp-am-player">
  <div class="xmp-am-bg" id="xmp-am-bg"></div>
  <div class="xmp-am-top">
    <button type="button" class="xmp-am-chevron" id="xmp-am-dismiss" title="收起">⌄</button>
  </div>
  <div class="xmp-cover xmp-am-cover" id="xmp-cover" title="点按查看歌词">
    <div class="xmp-cover-placeholder">${ICON_MUSIC_LARGE}</div>
  </div>
  <div class="xmp-vinyl-wrap" id="xmp-vinyl-wrap" style="display:none">
    <div class="xmp-vinyl" id="xmp-vinyl">
      <div class="xmp-vinyl-label" id="xmp-vinyl-label"><div class="xmp-vinyl-label-placeholder">${ICON_MUSIC_LARGE}</div></div>
      <div class="xmp-vinyl-hole"></div>
    </div>
    <div class="xmp-vinyl-arm" id="xmp-vinyl-arm"><div class="xmp-vinyl-arm-body"></div><div class="xmp-vinyl-arm-pivot"></div></div>
  </div>
  <div class="xmp-am-meta">
    <div class="xmp-am-meta-text">
      <div class="xmp-now-title" id="xmp-now-title">未在播放</div>
      <div class="xmp-now-artist" id="xmp-now-artist">添加歌曲开始播放</div>
    </div>
    <div class="xmp-am-meta-actions">
      <button type="button" class="xmp-am-fav-btn" id="xmp-am-more" title="添加到歌单">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>
  </div>
  <div class="xmp-am-line-lyric" id="xmp-am-line-lyric">—</div>
  <div class="xmp-progress-wrap">
    <div class="xmp-progress-track" id="xmp-progress-track"><div class="xmp-progress-inner" id="xmp-progress-inner"></div></div>
    <div class="xmp-time" id="xmp-time"><span id="xmp-time-cur">0:00</span><span id="xmp-time-left">-0:00</span></div>
  </div>
  <div class="xmp-controls xmp-am-controls">
    <button type="button" class="xmp-ctrl-btn" id="xmp-prev-btn">${ICON_PREV}</button>
    <button type="button" class="xmp-ctrl-btn xmp-play-btn" id="xmp-play-btn">${ICON_PLAY}</button>
    <button type="button" class="xmp-ctrl-btn" id="xmp-next-btn">${ICON_NEXT}</button>
  </div>
  <div class="xmp-am-secondary">
    <button type="button" class="xmp-loop-btn active" data-loop="list" id="xmp-am-loop">${ICON_LOOP_LIST}</button>
    <button type="button" class="xmp-footer-btn" id="xmp-refresh-btn">${ICON_REFRESH}</button>
  </div>
</div>
<div class="xmp-am-sheet-mask" id="xmp-am-sheet-mask" style="display:none"></div>
<div class="xmp-am-sheet" id="xmp-am-sheet" style="display:none">
  <div class="xmp-am-sheet-title">添加到歌单</div>
  <div class="xmp-am-sheet-list" id="xmp-am-sheet-list"></div>
  <button type="button" class="xmp-am-sheet-new" id="xmp-am-sheet-new">＋ 新建歌单并添加</button>
</div>
</div>
<div class="xmp-view" id="xmp-view-playlist" style="display:none">
<div class="xmp-playlist-view list-mode" id="xmp-playlist-view-root">
<div class="xmp-pl-page" id="xmp-pl-page">
<div class="xmp-pl-page-title">资料库</div>
<div class="xmp-ncm-search-box" id="xmp-ncm-search-box">
  <div class="xmp-ncm-search-row">
    <input type="search" id="xmp-ncm-search-input" placeholder="搜索网易云曲库" enterkeyhint="search" />
    <button type="button" id="xmp-ncm-search-btn">搜索</button>
  </div>
  <div id="xmp-ncm-search-results"></div>
</div>
<div class="xmp-pl-card-list" id="xmp-pl-card-list"></div>
<div class="xmp-pl-add-row">
<button type="button" class="xmp-footer-btn" id="xmp-playlist-add-btn2">${ICON_PLUS} 新建歌单</button>
<button type="button" class="xmp-footer-btn primary" id="xmp-goto-add-btn">${ICON_PLUS} 添加歌曲</button>
</div>
</div>
<div class="xmp-pl-detail" id="xmp-pl-detail" style="display:none">
<div class="xmp-pl-detail-bar">
<button type="button" class="xmp-pl-detail-back" id="xmp-pl-detail-back" title="返回">${ICON_BACK}</button>
<div class="xmp-pl-detail-title" id="xmp-pl-detail-title">歌单</div>
</div>
<div class="xmp-playlist-tabs" id="xmp-playlist-tabs" style="display:none"></div>
<div class="xmp-search-wrap" id="xmp-search-wrap">
<input type="text" class="xmp-search-input" id="xmp-search-input" placeholder="搜索当前列表" autocomplete="off">
</div>
<div id="xmp-playlist-head-wrap"><div class="xmp-playlist-head" id="xmp-playlist-head"></div></div>
<div class="xmp-playlist-toolbar" id="xmp-playlist-toolbar">
<div class="xmp-loop-modes">
<button type="button" class="xmp-loop-btn active" data-loop="list">${ICON_LOOP_LIST}</button>
<button type="button" class="xmp-loop-btn" data-loop="single">${ICON_LOOP_SINGLE}</button>
<button type="button" class="xmp-loop-btn" data-loop="shuffle">${ICON_SHUFFLE}</button>
</div>
<button type="button" class="xmp-footer-btn" id="xmp-clear-playlist-btn" style="font-size:12px;padding:6px 12px;">清空</button>
</div>
<div class="xmp-playlist-list" id="xmp-playlist-list"></div>
</div>
</div>
</div>
<div class="xmp-view" id="xmp-view-add" style="display:none">
<div class="xmp-add-view">
<div class="xmp-add-section">
<div class="xmp-add-section-title">从B站添加</div>
<div class="xmp-add-input-row">
<input type="text" class="xmp-add-input" id="xmp-bili-input" placeholder="BV号 / 链接" autocomplete="off">
<button type="button" class="xmp-add-btn" id="xmp-bili-add-btn">解析</button>
</div>
<label class="xmp-add-checkbox"><input type="checkbox" id="xmp-bili-season-chk"><span>解析所在合集</span></label>
<label class="xmp-add-checkbox"><input type="checkbox" id="xmp-bili-parts-chk"><span>解析分P</span></label>
<div class="xmp-add-hint">支持 BV号、AV号、完整链接。勾选分P/合集时会新建对应歌单。</div>
<div class="xmp-fav-progress" id="xmp-bili-progress" style="display:none;">
<div class="xmp-fav-progress-bar"><div class="xmp-fav-progress-inner" id="xmp-bili-progress-inner"></div></div>
<div class="xmp-fav-progress-text" id="xmp-bili-progress-text"></div>
</div>
</div>
<div class="xmp-add-section">
<div class="xmp-add-section-title">从收藏夹导入</div>
<div class="xmp-add-input-row">
<input type="text" class="xmp-add-input" id="xmp-fav-input" placeholder="收藏夹链接或ID" autocomplete="off">
<button type="button" class="xmp-add-btn" id="xmp-fav-import-btn">导入</button>
</div>
<div class="xmp-add-hint">支持 fid=xxx、数字ID</div>
<div class="xmp-fav-progress" id="xmp-fav-progress" style="display:none;">
<div class="xmp-fav-progress-bar"><div class="xmp-fav-progress-inner" id="xmp-fav-progress-inner"></div></div>
<div class="xmp-fav-progress-text" id="xmp-fav-progress-text"></div>
</div>
</div>
<div class="xmp-add-section">
<div class="xmp-add-section-title">从网易云音乐添加</div>
<div class="xmp-add-input-row" style="margin-bottom:8px;">
<button type="button" class="xmp-add-btn" id="xmp-ncm-login-btn" style="flex:1;">登录网易云</button>
<button type="button" class="xmp-add-btn" id="xmp-ncm-login-refresh" style="flex:0 0 auto;padding:0 12px;">刷新状态</button>
</div>
<div class="xmp-add-hint" id="xmp-ncm-login-status">检查登录状态中…</div>
<div class="xmp-add-input-row">
<input type="text" class="xmp-add-input" id="xmp-ncm-input" placeholder="网易云歌单分享链接或歌单 ID" autocomplete="off">
<button type="button" class="xmp-add-btn" id="xmp-ncm-add-btn">导入</button>
</div>
<div class="xmp-add-hint">导入后会<strong>新建歌单</strong>（名称与网易云一致）。播放 VIP 曲需先登录有权限的账号，本应用只使用你账号真实可用的地址，不会绕过版权限制。</div>
<div class="xmp-ncm-progress" id="xmp-ncm-progress">
<div class="xmp-ncm-progress-bar"><div class="xmp-ncm-progress-inner" id="xmp-ncm-progress-inner"></div></div>
<div class="xmp-ncm-progress-text" id="xmp-ncm-progress-text"></div>
</div>
</div>
<div class="xmp-add-section">
<div class="xmp-add-section-title">从本地添加</div>
<div class="xmp-drop-zone" id="xmp-drop-zone">
${ICON_UPLOAD}
<div>点击或拖拽音频文件到此</div>
</div>
<input type="file" id="xmp-file-input" accept="audio/*" multiple style="display:none">
</div>
</div>
</div>
<div class="xmp-view" id="xmp-view-search" style="display:none">
<div class="xmp-view-search">
  <div style="font-size:22px;font-weight:700;margin-bottom:12px;color:var(--fg-1)">搜索</div>
  <div class="xmp-cloud-search-row">
    <input type="search" id="xmp-cloud-search-input" placeholder="搜索网易云曲库（支持中文译名）" autocomplete="off">
    <button type="button" id="xmp-cloud-search-btn">搜索</button>
  </div>
  <div id="xmp-cloud-search-results"></div>
</div>
</div>
<div class="xmp-view" id="xmp-view-settings" style="display:none">
<div class="xmp-settings-view"><button type="button" class="xmp-settings-back" id="xmp-settings-back">‹ 返回</button><div class="xmp-settings-body" id="xmp-settings-body"></div></div>
</div>
<div class="xmp-status">
<div class="xmp-status-bar" id="xmp-status-bar">
<span class="xmp-status-indicator" id="xmp-status-indicator"></span>
<span class="xmp-status-text" id="xmp-status-text">就绪</span>
<span class="xmp-status-toggle" id="xmp-status-toggle">▲</span>
</div>
<div class="xmp-status-log" id="xmp-status-log"></div>
</div>
<div class="xmp-hours-view" id="xmp-hours-view">
<div class="xmp-hours-header">
<button type="button" class="xmp-hours-back" id="xmp-hours-back">${ICON_BACK}</button>
<div class="xmp-hours-title">时段统计</div>
<div style="width:40px;"></div>
</div>
<div class="xmp-hours-body" id="xmp-hours-body">
<div class="xmp-chart-block">
<div class="xmp-chart-head">
<div class="xmp-chart-title">本周一天内每小时平均听歌时长</div>
<div class="xmp-chart-hint" id="xmp-hourly-hint"></div>
</div>
<div class="xmp-chart-wrap"><svg class="xmp-chart-svg" id="xmp-hourly-chart"></svg></div>
</div>
<div class="xmp-chart-block">
<div class="xmp-chart-head">
<div class="xmp-chart-title">每日听歌时长（近 30 天）</div>
<div class="xmp-chart-hint" id="xmp-daily-hint"></div>
</div>
<div class="xmp-chart-wrap"><svg class="xmp-chart-svg" id="xmp-daily-chart"></svg></div>
</div>
</div>
</div>
<div class="xmp-mini-bar" id="xmp-mini-bar">
<div class="xmp-mini-cover" id="xmp-mini-cover"></div>
<div class="xmp-mini-info"><div class="xmp-mini-title" id="xmp-mini-title">未在播放</div><div class="xmp-mini-sub" id="xmp-mini-sub">点选唱片墙上的封面开始</div></div>
<button type="button" class="xmp-mini-play" id="xmp-mini-play" title="播放/暂停"></button>
<button type="button" class="xmp-mini-close" id="xmp-mini-close" title="关闭并停止">×</button>
</div>
<nav class="xmp-bottom-nav" id="xmp-bottom-nav">
<div class="xmp-nav-lens"><i></i></div>
<button type="button" class="xmp-nav-btn active" data-nav="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"/></svg><span>首页</span></button>
<button type="button" class="xmp-nav-btn xmp-nav-wallpick" data-nav="wallpick" title="墙内点选"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>点选</span></button>
<button type="button" class="xmp-nav-btn" data-nav="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg><span>搜索</span></button>
<button type="button" class="xmp-nav-btn" data-nav="personal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg><span>个人</span></button>
<button type="button" class="xmp-nav-btn" data-nav="playlist"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg><span>歌单</span></button>
<button type="button" class="xmp-nav-btn" data-nav="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span>设置</span></button>
</nav>
<input type="file" id="xmp-image-input" accept="image/*" style="display:none">`;
        document.body.appendChild(panel);
        try { bindPanelEvents(); } catch (e) { console.error('[INIT] bindPanelEvents', e); }
        try { updateLoopModeUI(); } catch (e) { console.error('[INIT] loop', e); }
        // 先切首页，设置/歌单列表延后，加快首屏
        try { switchAppView('home'); } catch (e) {
            console.error('[INIT] home', e);
            try {
                const w = panel.querySelector('#xmp-view-wall');
                if (w) w.style.display = 'flex';
                renderWall({ resetPan: true });
            } catch (e2) { console.error('[INIT] wall fallback', e2); }
        }
        setTimeout(() => {
            try { renderSettingsUI(); } catch (e) { console.error('[INIT] settings', e); }
            try { renderPlaylistTabs(); } catch (e) { console.error('[INIT] tabs', e); }
        }, 0);
        logStep('INIT', '应用已启动');
    }

    function bindPanelEvents() {
        if (!panel) return;
        const closeBtn = panel.querySelector('#xmp-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', collapsePanel);
        const settingsBtn = panel.querySelector('#xmp-settings-btn');
        if (settingsBtn) settingsBtn.addEventListener('click', () => switchView('settings'));
        panel.querySelectorAll('.xmp-tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));

        panel.querySelectorAll('.xmp-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => switchAppView(btn.dataset.nav));
        });
        const wallInput = panel.querySelector('#xmp-wall-search-input');
        if (wallInput) {
            let t = null;
            wallInput.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(() => runWallSearch(wallInput.value), 180);
            });
            wallInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); wallSearchNext(); }
                if (e.key === 'Escape') { setWallSearchOpen(false); switchAppView('home'); }
            });
        }
        const prevBtn = panel.querySelector('#xmp-wall-prev');
        const nextBtn = panel.querySelector('#xmp-wall-next');
        if (prevBtn) prevBtn.addEventListener('click', wallSearchPrev);
        if (nextBtn) nextBtn.addEventListener('click', wallSearchNext);
        const miniPlay = panel.querySelector('#xmp-mini-play');
        if (miniPlay) {
            miniPlay.innerHTML = ICON_PLAY;
            miniPlay.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); updateMiniBar(); });
        }
        const miniClose = panel.querySelector('#xmp-mini-close');
        if (miniClose) miniClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMiniBarAndStop();
        });
        const miniBar = panel.querySelector('#xmp-mini-bar');
        if (miniBar) { try { bindMiniBarDrag(miniBar); } catch (err) { console.error('[MINI] drag', err); } }
        try { bindNavLens(); } catch (err) { console.error('[NAV] lens', err); }
        if (miniBar) miniBar.addEventListener('click', (e) => {
            if (e.target.closest('#xmp-mini-play') || e.target.closest('#xmp-mini-close') || e.target.closest('button')) return;
            if (!currentTrack) return;
            switchAppView('player');
        });
        panel.querySelector('#xmp-play-btn').addEventListener('click', togglePlay);
        panel.querySelector('#xmp-prev-btn').addEventListener('click', playPrev);
        panel.querySelector('#xmp-next-btn').addEventListener('click', playNext);
        panel.querySelector('#xmp-status-bar').addEventListener('click', toggleStatusExpand);

        const progressTrack = panel.querySelector('#xmp-progress-track');
        if (progressTrack) progressTrack.addEventListener('click', (e) => {
            if (!audio) return;
            const dur = audio.duration;
            if (!dur || !isFinite(dur) || dur <= 0) { showToast('音频尚未加载，无法跳转'); return; }
            const rect = progressTrack.getBoundingClientRect();
            let pct = (e.clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            try { audio.currentTime = pct * dur; } catch (err) { logStep('ERR', `seek 失败：${err.message}`); }
        });

        panel.querySelector('#xmp-add-current-btn').addEventListener('click', () => {
            if (currentTrack) addTrackToCurrentPlaylist(currentTrack);
            else showToast('当前没有播放中的歌曲');
        });
        panel.querySelector('#xmp-refresh-btn').addEventListener('click', async () => {
            if (!currentTrack || currentTrack.type !== 'bilibili') { showToast('当前不是B站歌曲'); return; }
            try {
                logStep('PLAY', '手动刷新音频链接');
                showToast('正在刷新链接…');
                await refreshBilibiliAudio(currentTrack);
                savePlaylists();
                playTrack(currentTrack);
                showToast('链接已刷新');
            } catch (err) {
                logStep('ERR', `刷新失败：${err.message}`);
                showToast('刷新失败: ' + err.message);
            }
        });
        const gotoAdd = panel.querySelector('#xmp-goto-add-btn');
        if (gotoAdd) gotoAdd.addEventListener('click', () => switchView('add'));
        const addPl2 = panel.querySelector('#xmp-playlist-add-btn2');
        if (addPl2) addPl2.addEventListener('click', () => {
            const name = window.prompt('新歌单名称', '新歌单');
            if (name == null) return;
            const pl = createPlaylist(name.trim() || '新歌单');
            currentPlaylistId = pl.id; saveState();
            renderPlaylistTabs();
            showToast('已创建歌单');
        });
        const detailBack = panel.querySelector('#xmp-pl-detail-back');
        if (detailBack) detailBack.addEventListener('click', () => {
            if (playlistPageMode === 'personal') switchAppView('home');
            else closePlaylistDetail();
        });
        // 右缘右滑返回
        (function bindDetailEdgeSwipe() {
            const detail = panel.querySelector('#xmp-pl-detail');
            if (!detail) return;
            let sx = 0, sy = 0, active = false;
            detail.addEventListener('touchstart', (e) => {
                if (!e.touches || !e.touches[0]) return;
                if (playlistPageMode === 'list') return;
                const t = e.touches[0];
                if (t.clientX > 28) return; // 仅左缘开始
                sx = t.clientX; sy = t.clientY; active = true;
            }, { passive: true });
            detail.addEventListener('touchend', (e) => {
                if (!active) return;
                active = false;
                const t = e.changedTouches && e.changedTouches[0];
                if (!t) return;
                const dx = t.clientX - sx, dy = t.clientY - sy;
                if (dx > 72 && Math.abs(dy) < 64) {
                    if (playlistPageMode === 'personal') switchAppView('home');
                    else closePlaylistDetail();
                }
            }, { passive: true });
        })();
        panel.querySelector('#xmp-clear-playlist-btn').addEventListener('click', () => {
            if (currentPlaylistId === STATS_PLAYLIST_ID) { showToast('听歌排行无法清空，可在设置里重置统计'); return; }
            const pl = getCurrentPlaylist();
            if (!pl || pl.tracks.length === 0) { showToast('当前歌单已是空的'); return; }
            if (!window.confirm(`确定清空「${pl.name}」中的所有歌曲吗？`)) return;
            pl.tracks.forEach(t => { if (t.fileUrl && t.type === 'local') URL.revokeObjectURL(t.fileUrl); });
            pl.tracks = []; pl.updatedAt = Date.now();
            if (audio) { audio.pause(); audio.src = ''; }
            currentTrack = null; currentTrackIndex = -1;
            savePlaylists(); saveState(); renderPlaylist();
            updateNowPlayingUI(); updateFabIcon(); notifyNativePlayState();
            scheduleAutoSync();
        });

        panel.querySelectorAll('.xmp-loop-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loopMode = btn.dataset.loop;
                saveState(); updateLoopModeUI(); notifyNativePlayState();
                showToast(`循环: ${loopMode === 'list' ? '列表' : loopMode === 'single' ? '单曲' : '随机'}`);
            });
        });

        const biliInput = panel.querySelector('#xmp-bili-input');
        const biliAddBtn = panel.querySelector('#xmp-bili-add-btn');
        const biliSeasonChk = panel.querySelector('#xmp-bili-season-chk');
        const biliPartsChk = panel.querySelector('#xmp-bili-parts-chk');
        const biliProgress = panel.querySelector('#xmp-bili-progress');
        const biliProgressInner = panel.querySelector('#xmp-bili-progress-inner');
        const biliProgressText = panel.querySelector('#xmp-bili-progress-text');
        function updateBiliProgress(prog) {
            if (!biliProgress) return;
            if (prog.stage === 'done') { biliProgress.style.display = 'none'; showToast(prog.message); return; }
            biliProgress.style.display = '';
            if (biliProgressText) biliProgressText.textContent = prog.message + (prog.title ? ` — ${prog.title}` : '');
            if (biliProgressInner && prog.total > 0) biliProgressInner.style.width = ((prog.current / prog.total) * 100).toFixed(1) + '%';
        }
        if (biliAddBtn) biliAddBtn.addEventListener('click', async () => {
            const url = biliInput.value.trim();
            if (!url) { showToast('请输入B站链接'); return; }
            const videoId = extractVideoId(url);
            if (!videoId) { showToast('无法识别B站链接'); return; }
            logStep('IN', `输入：${url}`);
            const wantSeason = biliSeasonChk && biliSeasonChk.checked;
            const wantParts = biliPartsChk && biliPartsChk.checked;
            biliAddBtn.disabled = true;
            biliAddBtn.textContent = '解析中';
            try {
                if (wantParts && videoId.type === 'BV') {
                    biliAddBtn.textContent = '检查分P中';
                    if (biliProgress) { biliProgress.style.display = ''; if (biliProgressInner) biliProgressInner.style.width = '0%'; if (biliProgressText) biliProgressText.textContent = '正在检查分P…'; }
                    try {
                        await importBilibiliParts(videoId.id, updateBiliProgress);
                        biliInput.value = ''; switchView('playlist'); return;
                    } catch (err) {
                        if (/只有一个分P/.test(err.message)) {
                            if (biliProgress) biliProgress.style.display = 'none';
                            logStep('IN', '只有一个分P，作为单曲处理');
                            showToast('该视频只有一个分P，将作为单曲添加');
                        } else { throw err; }
                    }
                }
                if (wantSeason && videoId.type === 'BV') {
                    biliAddBtn.textContent = '检查中';
                    if (biliProgress) { biliProgress.style.display = ''; if (biliProgressInner) biliProgressInner.style.width = '0%'; if (biliProgressText) biliProgressText.textContent = '正在检查合集…'; }
                    try {
                        await importBilibiliSeason(videoId.id, updateBiliProgress);
                        biliInput.value = ''; switchView('playlist'); return;
                    } catch (err) {
                        if (/不属于任何合集/.test(err.message)) {
                            if (biliProgress) biliProgress.style.display = 'none';
                            logStep('IN', '不属于合集，作为单曲处理');
                            showToast('该视频不属于合集，将作为单曲添加');
                        } else { throw err; }
                    }
                }
                biliAddBtn.textContent = '解析中';
                const track = await resolveBilibiliUrl(url);
                addTrackToCurrentPlaylist(track);
                biliInput.value = '';
                const pl = getCurrentPlaylist();
                if (pl && pl.tracks.length === 1) { currentTrackIndex = 0; playTrack(track); }
            } catch (err) {
                logStep('ERR', `解析失败：${err.message}`);
                showToast('解析失败: ' + err.message);
                if (biliProgress) biliProgress.style.display = 'none';
            } finally {
                biliAddBtn.disabled = false;
                biliAddBtn.textContent = '解析';
            }
        });
        biliInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); biliAddBtn.click(); } });

        const favInput = panel.querySelector('#xmp-fav-input');
        const favImportBtn = panel.querySelector('#xmp-fav-import-btn');
        const favProgress = panel.querySelector('#xmp-fav-progress');
        const favProgressInner = panel.querySelector('#xmp-fav-progress-inner');
        const favProgressText = panel.querySelector('#xmp-fav-progress-text');
        function updateFavProgress(prog) {
            if (!favProgress) return;
            if (prog.stage === 'done') { favProgress.style.display = 'none'; showToast(prog.message); return; }
            favProgress.style.display = '';
            if (favProgressText) favProgressText.textContent = prog.message + (prog.title ? ` — ${prog.title}` : '');
            if (favProgressInner && prog.total > 0) favProgressInner.style.width = ((prog.current / prog.total) * 100).toFixed(1) + '%';
        }
        favImportBtn.addEventListener('click', async () => {
            const input = favInput.value.trim();
            if (!input) { showToast('请输入收藏夹链接或ID'); return; }
            favImportBtn.disabled = true;
            favImportBtn.textContent = '导入中';
            if (favProgress) favProgress.style.display = '';
            if (favProgressInner) favProgressInner.style.width = '0%';
            if (favProgressText) favProgressText.textContent = '准备中…';
            try {
                await importBilibiliFav(input, updateFavProgress);
                favInput.value = ''; switchView('playlist');
            } catch (err) {
                logStep('ERR', `收藏夹导入失败：${err.message}`);
                showToast('导入失败: ' + err.message);
                if (favProgress) favProgress.style.display = 'none';
            } finally {
                favImportBtn.disabled = false;
                favImportBtn.textContent = '导入';
            }
        });
        favInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); favImportBtn.click(); } });
        const ncmInput = panel.querySelector('#xmp-ncm-input');
        const ncmAddBtn = panel.querySelector('#xmp-ncm-add-btn');
        const ncmProgress = panel.querySelector('#xmp-ncm-progress');
        const ncmProgressInner = panel.querySelector('#xmp-ncm-progress-inner');
        const ncmProgressText = panel.querySelector('#xmp-ncm-progress-text');
        const ncmLoginBtn = panel.querySelector('#xmp-ncm-login-btn');
        const ncmLoginRefresh = panel.querySelector('#xmp-ncm-login-refresh');
        if (ncmLoginBtn) ncmLoginBtn.addEventListener('click', () => ncmOpenLogin());
        if (ncmLoginRefresh) ncmLoginRefresh.addEventListener('click', () => {
            refreshNcmLoginUI();
            const st = ncmGetLoginStatus();
            showToast(st.loggedIn ? '已检测到网易云登录' : '尚未登录网易云');
        });
        refreshNcmLoginUI();

        ncmAddBtn.addEventListener('click', async () => {
            const input = ncmInput.value.trim();
            if (!input) { showToast('请输入网易云歌单链接或 ID'); return; }
            ncmAddBtn.disabled = true; ncmAddBtn.textContent = '解析中';
            if (ncmProgress) ncmProgress.style.display = '';
            if (ncmProgressInner) ncmProgressInner.style.width = '15%';
            if (ncmProgressText) ncmProgressText.textContent = '正在获取歌单信息…';
            try {
                await importNeteasePlaylist(input);
                if (ncmProgressInner) ncmProgressInner.style.width = '100%';
                if (ncmProgressText) ncmProgressText.textContent = '导入完成';
                ncmInput.value = ''; switchView('playlist');
            } catch (err) {
                logStep('ERR', `网易云导入失败：${err.message}`);
                showToast('网易云导入失败：' + err.message);
            } finally {
                setTimeout(() => { if (ncmProgress) ncmProgress.style.display = 'none'; }, 500);
                ncmAddBtn.disabled = false; ncmAddBtn.textContent = '导入';
            }
        });
        ncmInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); ncmAddBtn.click(); }
        });


        const dropZone = panel.querySelector('#xmp-drop-zone');
        const fileInput = panel.querySelector('#xmp-file-input');
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => { handleLocalFiles(fileInput.files); fileInput.value = ''; });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleLocalFiles(e.dataTransfer.files);
        });

        const header = panel.querySelector('#xmp-header');
        let headerDragging = false, headerStartX = 0, headerStartY = 0, headerStartLeft = 0, headerStartTop = 0;
        header.addEventListener('pointerdown', (e) => {
            if (EMBED_MODE) return;
            if (e.target.closest('.xmp-icon-btn')) return;
            e.preventDefault();
            const rect = panel.getBoundingClientRect();
            headerDragging = true;
            headerStartX = e.clientX; headerStartY = e.clientY;
            headerStartLeft = rect.left; headerStartTop = rect.top;
            header.setPointerCapture(e.pointerId);
        });
        header.addEventListener('pointermove', (e) => {
            if (!headerDragging) return;
            e.preventDefault();
            panel.style.left = (headerStartLeft + e.clientX - headerStartX) + 'px';
            panel.style.top = (headerStartTop + e.clientY - headerStartY) + 'px';
        });
        header.addEventListener('pointerup', (e) => {
            if (!headerDragging) return;
            headerDragging = false;
            try { header.releasePointerCapture(e.pointerId); } catch (err) { }
        });
        header.addEventListener('pointercancel', () => { headerDragging = false; });

        /* 时段视图交互 */
        const hoursView = panel.querySelector('#xmp-hours-view');
        if (hoursView) {
            panel.querySelector('#xmp-hours-back').addEventListener('click', closeHoursView);

            let dragging = false, startX = 0, startY = 0, curDx = 0, pid = null, locked = false;
            hoursView.addEventListener('pointerdown', (e) => {
                if (!hoursView.classList.contains('open')) return;
                const rect = hoursView.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                if (localX > 48) return;
                dragging = true; locked = false;
                pid = e.pointerId;
                startX = e.clientX; startY = e.clientY; curDx = 0;
                try { hoursView.setPointerCapture(pid); } catch (err) { }
            });
            hoursView.addEventListener('pointermove', (e) => {
                if (!dragging || e.pointerId !== pid) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (!locked) {
                    if (Math.abs(dx) < Math.abs(dy) && Math.abs(dx) < 6) return;
                    if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
                    locked = true;
                }
                curDx = Math.max(0, dx);
                hoursView.classList.add('dragging');
                hoursView.style.transform = `translateX(${curDx}px)`;
            });
            const endDrag = (e) => {
                if (!dragging) return;
                if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
                dragging = false;
                hoursView.classList.remove('dragging');
                try { hoursView.releasePointerCapture(pid); } catch (err) { }
                const w = hoursView.offsetWidth || 360;
                if (curDx > w * 0.28) { hoursView.style.transform = ''; closeHoursView(); }
                else { hoursView.style.transform = ''; }
                curDx = 0;
            };
            hoursView.addEventListener('pointerup', endDrag);
            hoursView.addEventListener('pointercancel', endDrag);
        }

        /* 搜索框 */
        const searchInput = panel.querySelector('#xmp-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (currentPlaylistId === STATS_PLAYLIST_ID) {
                    currentPlaylistId = playlists[0].id;
                    saveState();
                    renderPlaylistTabs();
                    renderPlaylistHead();
                }
                renderPlaylist();
            });
        }

        window.addEventListener('resize', () => {
            const view = panel.querySelector('#xmp-hours-view');
            if (view && view.classList.contains('open')) renderHoursView();
        });

        const imageInput = panel.querySelector('#xmp-image-input');
        imageInput.addEventListener('change', () => {
            const file = imageInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = () => { if (pendingImageCallback) { pendingImageCallback(reader.result); pendingImageCallback = null; } };
                reader.readAsDataURL(file);
            }
            imageInput.value = '';
        });
    }

    function pickImage(cb) {
        if (!panel) return;
        pendingImageCallback = cb;
        panel.querySelector('#xmp-image-input').click();
    }

    function handleLocalFiles(files) {
        if (!files || files.length === 0) return;
        const pl = getCurrentPlaylist();
        if (!pl) return;
        let added = 0;
        for (const file of files) {
            if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac|aac|wma|opus)$/i.test(file.name)) {
                showToast(`跳过非音频: ${file.name}`); continue;
            }
            pl.tracks.push(addLocalFile(file)); added++;
        }
        if (added > 0) {
            pl.updatedAt = Date.now();
            savePlaylists(); renderPlaylist();
            showToast(`已添加 ${added} 首`);
            if (!currentTrack && pl.tracks.length > 0) {
                currentTrackIndex = pl.tracks.length - added;
                playTrack(pl.tracks[currentTrackIndex]);
            }
            scheduleAutoSync();
        }
    }

    function switchView(view) {
        if (!panel) return;
        // 兼容旧顶部 tab：映射到新主导航
        if (view === 'player') { switchAppView('player'); return; }
        if (view === 'playlist') { switchAppView('playlist'); return; }
        if (view === 'settings') { switchAppView('settings'); return; }
        if (view === 'add') {
            currentAppView = 'add';
            setWallSearchOpen(false);
            panel.querySelectorAll('.xmp-nav-btn').forEach(b => b.classList.remove('active'));
            panel.querySelectorAll('.xmp-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'add'));
            ['player', 'playlist', 'add', 'settings', 'wall', 'search'].forEach(v => {
                const el = panel.querySelector('#xmp-view-' + v);
                if (el) el.style.display = v === 'add' ? '' : 'none';
            });
            return;
        }
        switchAppView(view);
    }

    /* ========== 歌单 UI ========== */



    function hapticTap() {
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
        try { if (window.GM && typeof window.GM.vibrate === 'function') window.GM.vibrate(12); } catch (_) {}
    }


    function focusCloudSearch() {
        const input = panel && panel.querySelector('#xmp-cloud-search-input');
        if (input) setTimeout(() => { try { input.focus(); } catch (_) {} }, 180);
    }
    function bindCloudSearchPage() {
        if (!panel) return;
        const input = panel.querySelector('#xmp-cloud-search-input');
        const btn = panel.querySelector('#xmp-cloud-search-btn');
        const box = panel.querySelector('#xmp-cloud-search-results');
        if (!input || !btn || !box || btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        const run = async () => {
            const q = (input.value || '').trim();
            if (!q) { showToast('请输入关键词'); return; }
            box.innerHTML = '<div style="opacity:.6;padding:24px;text-align:center">搜索中…</div>';
            let data = null;
            try { data = await ncmSearchSongs(q, 40); } catch (e) { data = { ok: false, message: String(e && e.message || e) }; }
            if (!data || !data.ok) {
                box.innerHTML = '<div style="opacity:.6;padding:24px;text-align:center">' + escHtml((data && data.message) || '搜索失败，请确认已更新 MainActivity') + '</div>';
                return;
            }
            const songs = data.songs || data.tracks || [];
            if (!songs.length) {
                box.innerHTML = '<div style="opacity:.6;padding:24px;text-align:center">无结果</div>';
                return;
            }
            box._songs = songs;
            box.innerHTML = songs.map((s, i) => {
                const title = s.name || s.title || '未知';
                const alias = s.alias || s.tns || '';
                const artist = s.artist || '';
                const cover = s.cover || s.picUrl || '';
                const sub = (alias && String(alias) !== title) ? (artist + (artist ? ' · ' : '') + alias) : artist;
                return '<div class="xmp-cloud-result" data-i="' + i + '">'
                    + (cover ? '<img src="' + escHtml(cover) + '" referrerpolicy="no-referrer" alt="">' : '<div style="width:52px;height:52px;border-radius:8px;background:#333"></div>')
                    + '<div class="xmp-cloud-result-meta"><div class="xmp-cloud-result-title">' + escHtml(title) + '</div>'
                    + '<div class="xmp-cloud-result-sub">' + escHtml(sub) + '</div></div></div>';
            }).join('');
            box.querySelectorAll('.xmp-cloud-result').forEach(el => {
                el.addEventListener('click', () => {
                    const s = (box._songs || [])[Number(el.dataset.i)];
                    if (!s) return;
                    const track = (typeof ncmItemToTrack === 'function') ? ncmItemToTrack(s) : {
                        id: (typeof uid === 'function' ? uid('ncm') : ('ncm_' + s.id)),
                        type: 'netease', neteaseId: String(s.id || ''),
                        title: s.name || s.title || '未知', artist: s.artist || '',
                        cover: s.cover || s.picUrl || '', alias: s.alias || s.tns || '',
                        duration: s.duration || 0, fee: s.fee || 0
                    };
                    let pl = getCurrentPlaylist() || (playlists && playlists[0]);
                    if (!pl) {
                        try { pl = createPlaylist('搜索播放'); } catch (_) {
                            pl = { id: 'pl_search', name: '搜索播放', tracks: [], showOnWall: true };
                            playlists.push(pl);
                        }
                    }
                    const exist = pl.tracks.findIndex(x => x.type === 'netease' && String(x.neteaseId) === String(track.neteaseId));
                    if (exist >= 0) {
                        currentPlaylistId = pl.id; currentTrackIndex = exist;
                        playTrack(pl.tracks[exist]);
                    } else {
                        pl.tracks.push(track); pl.updatedAt = Date.now(); savePlaylists();
                        currentPlaylistId = pl.id; currentTrackIndex = pl.tracks.length - 1;
                        playTrack(track);
                    }
                    showToast('开始播放');
                    try { switchAppView('player'); } catch (_) {}
                });
            });
        };
        btn.addEventListener('click', (e) => { e.preventDefault(); run(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); run(); }
        });
    }

    function openAmSheet() {
        if (!panel || !currentTrack) { showToast('当前没有在播歌曲'); return; }
        const mask = panel.querySelector('#xmp-am-sheet-mask');
        const sheet = panel.querySelector('#xmp-am-sheet');
        const list = panel.querySelector('#xmp-am-sheet-list');
        if (!mask || !sheet || !list) return;
        const selected = new Set();
        list.innerHTML = playlists.map(pl =>
            '<label class="xmp-am-sheet-item" data-pl="' + escHtml(pl.id) + '">'
            + '<input type="checkbox" data-pl="' + escHtml(pl.id) + '">'
            + '<span>' + escHtml(pl.name) + '</span>'
            + '<span style="margin-left:auto;opacity:.5;font-size:12px">' + pl.tracks.length + '</span></label>'
        ).join('') || '<div class="xmp-am-sheet-item" style="opacity:.5">暂无歌单</div>';
        // confirm button
        let conf = sheet.querySelector('#xmp-am-sheet-confirm');
        if (!conf) {
            conf = document.createElement('button');
            conf.type = 'button';
            conf.id = 'xmp-am-sheet-confirm';
            conf.className = 'xmp-am-sheet-confirm';
            conf.textContent = '确认添加';
            sheet.appendChild(conf);
        }
        conf.onclick = () => {
            const checks = list.querySelectorAll('input[type=checkbox]:checked');
            if (!checks.length) { showToast('请选择至少一个歌单'); return; }
            let n = 0;
            checks.forEach(ch => {
                const pl = playlists.find(p => p.id === ch.dataset.pl);
                if (!pl || !currentTrack) return;
                const dup = pl.tracks.some(x => x.id === currentTrack.id ||
                    (x.type === 'netease' && currentTrack.type === 'netease' && String(x.neteaseId) === String(currentTrack.neteaseId)));
                if (dup) return;
                pl.tracks.push(JSON.parse(JSON.stringify(currentTrack)));
                pl.updatedAt = Date.now();
                n++;
            });
            if (n) { savePlaylists(); showToast('已添加到 ' + n + ' 个歌单'); }
            else showToast('所选歌单中已有此曲');
            closeAmSheet();
        };
        const neu = panel.querySelector('#xmp-am-sheet-new');
        if (neu) {
            neu.onclick = () => {
                const name = window.prompt('新歌单名称', '新歌单');
                if (!name) return;
                let pl = null;
                try { if (typeof createPlaylist === 'function') pl = createPlaylist(name.trim()); } catch (_) {}
                if (!pl) {
                    pl = { id: uid('pl'), name: name.trim(), cover: '', tracks: [], createdAt: Date.now(), updatedAt: Date.now(), showOnWall: true, excludeFromStats: false };
                    playlists.push(pl);
                }
                if (currentTrack) {
                    pl.tracks.push(JSON.parse(JSON.stringify(currentTrack)));
                    pl.updatedAt = Date.now();
                }
                savePlaylists();
                showToast('已创建并添加');
                closeAmSheet();
            };
        }
        mask.style.display = '';
        sheet.style.display = '';
        if (!mask.dataset.bound) {
            mask.dataset.bound = '1';
            mask.addEventListener('click', closeAmSheet);
        }
    }

    function closeAmSheet() {
        if (!panel) return;
        const mask = panel.querySelector('#xmp-am-sheet-mask');
        const sheet = panel.querySelector('#xmp-am-sheet');
        if (mask) mask.style.display = 'none';
        if (sheet) sheet.style.display = 'none';
    }

    function updateAmLineLyric() {
        if (!panel) return;
        const el = panel.querySelector('#xmp-am-line-lyric');
        if (!el) return;
        try {
            if (!lyLines || !lyLines.length || !audio) { el.textContent = '—'; return; }
            const t = audio.currentTime || 0;
            let cur = '';
            for (let i = 0; i < lyLines.length; i++) {
                if (lyLines[i].time <= t + 0.05) cur = lyLines[i].text || '';
                else break;
            }
            el.textContent = cur || '—';
        } catch (_) { el.textContent = '—'; }
    }


    function ensureHomeExtras() {
        if (!panel) return;
        const wall = panel.querySelector('#xmp-view-wall');
        if (!wall) return;
        if (!panel.querySelector('#xmp-carousel-home')) {
            const d = document.createElement('div');
            d.id = 'xmp-carousel-home';
            d.className = 'xmp-carousel-home';
            d.innerHTML = '<div class="xmp-carousel-bg" id="xmp-carousel-bg"></div><div class="xmp-carousel-track" id="xmp-carousel-track"></div>';
            wall.appendChild(d);
        }
        let ipodEl = panel.querySelector('#xmp-ipod-home');
        if (ipodEl && !ipodEl.querySelector('.xmp-ipod-bezel')) {
            ipodEl.remove();
            ipodEl = null;
        }
        if (!ipodEl) {
            const d = document.createElement('div');
            d.id = 'xmp-ipod-home';
            d.className = 'xmp-ipod-home';
            d.innerHTML = '<button type="button" class="xmp-ipod-settings" id="xmp-ipod-settings">⚙</button>'
                + '<div class="xmp-ipod-bezel"><div class="xmp-ipod-screen">'
                + '<div class="xmp-ipod-split" id="xmp-ipod-browse">'
                + '<div class="xmp-ipod-split-cover"><div class="xmp-ipod-thumb" id="xmp-ipod-browse-cover"></div></div>'
                + '<div class="xmp-ipod-split-main"><div class="xmp-ipod-list" id="xmp-ipod-list"></div></div></div>'
                + '<div class="xmp-ipod-now" id="xmp-ipod-now"><div class="xmp-ipod-now-cover" id="xmp-ipod-now-cover"></div>'
                + '<div class="xmp-ipod-now-ly" id="xmp-ipod-now-ly"></div></div>'
                + '</div></div>'
                + '<div class="xmp-ipod-wheel-wrap"><div class="xmp-ipod-wheel" id="xmp-ipod-wheel">'
                + '<span class="xmp-ipod-seg menu">MENU</span><span class="xmp-ipod-seg prev">◁◁</span>'
                + '<span class="xmp-ipod-seg next">▷▷</span><span class="xmp-ipod-seg play">▶❚❚</span>'
                + '<button type="button" class="xmp-ipod-center" id="xmp-ipod-center">SELECT</button></div></div>';
            wall.appendChild(d);
            bindIpodWheel();
        }
    }

    function playlistsForHome() {
        return playlists.filter(pl => pl.showOnWall !== false);
    }

    function renderCarouselHome() {
        ensureHomeExtras();
        const car = panel.querySelector('#xmp-carousel-home');
        const ipod = panel.querySelector('#xmp-ipod-home');
        if (ipod) ipod.classList.remove('show');
        if (!car) return;
        car.classList.add('show');
        const track = panel.querySelector('#xmp-carousel-track');
        const bg = panel.querySelector('#xmp-carousel-bg');
        const list = playlistsForHome();
        if (!list.length) {
            track.innerHTML = '<div style="color:#fff;padding:40px;text-align:center;width:100%">没有可展示的歌单<br>请在歌单设置中开启「展示在唱片墙/主页」</div>';
            return;
        }
        track.innerHTML = list.map((pl, i) => {
            const cover = pl.cover || (pl.tracks[0] && pl.tracks[0].cover) || '';
            return '<div class="xmp-carousel-card" data-i="' + i + '" data-pl="' + escHtml(pl.id) + '">'
                + '<div class="xmp-carousel-card-cover">' + (cover ? '<img src="' + escHtml(cover) + '" referrerpolicy="no-referrer">' : '') + '</div>'
                + '<div class="xmp-carousel-card-name">' + escHtml(pl.name) + '</div>'
                + '<div class="xmp-carousel-card-meta">' + pl.tracks.length + ' 首</div></div>';
        }).join('');
        const cards = [...track.querySelectorAll('.xmp-carousel-card')];
        const setCenter = () => {
            const mid = track.scrollLeft + track.clientWidth / 2;
            let best = null, bestD = 1e9;
            cards.forEach(c => {
                const cx = c.offsetLeft + c.offsetWidth / 2;
                const d = Math.abs(cx - mid);
                c.classList.toggle('is-center', false);
                if (d < bestD) { bestD = d; best = c; }
            });
            if (best) {
                best.classList.add('is-center');
                const pl = playlists.find(p => p.id === best.dataset.pl);
                const cover = pl && (pl.cover || (pl.tracks[0] && pl.tracks[0].cover));
                if (bg && cover) bg.style.backgroundImage = 'url("' + cover + '")';
            }
        };
        track.onscroll = () => {
            if (track._raf) return;
            track._raf = requestAnimationFrame(() => { track._raf = 0; setCenter(); });
        };
        cards.forEach(c => c.addEventListener('click', () => {
            openPlaylistDetail(c.dataset.pl);
            switchAppView('playlist');
        }));
        setTimeout(setCenter, 50);
    }

    let ipodSel = 0, ipodMode = 'pl'; // pl | tracks | now
    let ipodTrackSel = 0;
    let ipodHoldTimer = 0, ipodHoldDir = '';

    function bindIpodWheel() {
        const wheel = panel.querySelector('#xmp-ipod-wheel');
        const center = panel.querySelector('#xmp-ipod-center');
        const settingsBtn = panel.querySelector('#xmp-ipod-settings');
        if (!wheel || wheel.dataset.bound) return;
        wheel.dataset.bound = '1';
        if (settingsBtn) settingsBtn.addEventListener('click', () => switchAppView('settings'));

        const sector = (x, y, rect) => {
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            const dx = x - cx, dy = y - cy;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r < rect.width * 0.18) return 'center';
            const ang = Math.atan2(dy, dx);
            if (ang < -Math.PI * 0.75 || ang >= Math.PI * 0.75) return 'prev';
            if (ang < -Math.PI * 0.25) return 'menu';
            if (ang < Math.PI * 0.25) return 'next';
            return 'play';
        };
        const angleAt = (x, y, rect) => {
            return Math.atan2(y - (rect.top + rect.height / 2), x - (rect.left + rect.width / 2));
        };
        const clearPressAnim = () => {
            try {
                wheel.classList.remove('is-press-menu', 'is-press-prev', 'is-press-next', 'is-press-play');
            } catch (_) {}
        };
        // withAnim: 点按才有动效；旋转选取不加动效
        const fire = (dir, withAnim) => {
            if (!dir || dir === 'center') return;
            hapticTap();
            if (withAnim) {
                try {
                    clearPressAnim();
                    if (dir === 'menu' || dir === 'prev' || dir === 'next' || dir === 'play') {
                        wheel.classList.add('is-press-' + dir);
                        clearTimeout(wheel._pressT);
                        wheel._pressT = setTimeout(clearPressAnim, 140);
                    }
                } catch (_) {}
            } else {
                clearPressAnim();
            }
            ipodAction(dir);
        };

        let lastAng = null;
        let startSec = '';
        let rotating = false;
        let holdDelayTimer = 0;
        const STEP = 0.28; // 约 16° 一步，旋转快速选曲

        const clearHold = () => {
            clearTimeout(holdDelayTimer);
            holdDelayTimer = 0;
            clearInterval(ipodHoldTimer);
            ipodHoldTimer = 0;
            ipodHoldDir = '';
        };

        wheel.addEventListener('touchstart', (e) => {
            const touch = e.changedTouches[0];
            const rect = wheel.getBoundingClientRect();
            const sec = sector(touch.clientX, touch.clientY, rect);
            if (sec === 'center') return;
            clearHold();
            clearPressAnim();
            rotating = false;
            startSec = sec;
            lastAng = angleAt(touch.clientX, touch.clientY, rect);
            // 仅在「按住不动」时对左右键启动长按连发；一旦滑动进入旋转模式则取消
            holdDelayTimer = setTimeout(() => {
                if (rotating) return;
                if (startSec !== 'prev' && startSec !== 'next') return;
                ipodHoldDir = startSec;
                fire(startSec, true);
                ipodHoldTimer = setInterval(() => {
                    if (rotating) { clearHold(); return; }
                    fire(ipodHoldDir, true);
                }, 380);
            }, 420);
        }, { passive: true });

        wheel.addEventListener('touchmove', (e) => {
            if (lastAng == null) return;
            const touch = e.changedTouches[0];
            const rect = wheel.getBoundingClientRect();
            const ang = angleAt(touch.clientX, touch.clientY, rect);
            let d = ang - lastAng;
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;

            if (!rotating && Math.abs(d) > 0.12) {
                // 进入旋转选取：取消长按连发，去掉按键动效
                rotating = true;
                clearHold();
                clearPressAnim();
            }
            if (!rotating) return;

            // 只触发选取（prev/next），不触发途经的 menu / play
            if (Math.abs(d) >= STEP) {
                const steps = Math.min(4, Math.floor(Math.abs(d) / STEP));
                const dir = d > 0 ? 'next' : 'prev';
                for (let i = 0; i < steps; i++) fire(dir, false);
                lastAng = ang;
            }
        }, { passive: true });

        wheel.addEventListener('touchend', () => {
            const wasRotating = rotating;
            clearHold();
            // 轻点松手：触发按下位置的一次按键（含 MENU / 播放），带动效
            if (!wasRotating && startSec) {
                fire(startSec, true);
            }
            clearPressAnim();
            lastAng = null;
            startSec = '';
            rotating = false;
        });
        wheel.addEventListener('touchcancel', () => {
            clearHold();
            clearPressAnim();
            lastAng = null;
            startSec = '';
            rotating = false;
        });

        let lastCenterTap = 0;
        center.addEventListener('touchstart', () => { center.classList.add('is-press'); }, { passive: true });
        center.addEventListener('touchend', () => { center.classList.remove('is-press'); }, { passive: true });
        center.addEventListener('click', (e) => {
            e.stopPropagation();
            hapticTap();
            center.classList.add('is-press');
            setTimeout(() => center.classList.remove('is-press'), 120);
            const now = Date.now();
            if (now - lastCenterTap < 320) {
                hapticTap();
                ipodAction('select-double');
                lastCenterTap = 0;
            } else {
                lastCenterTap = now;
                setTimeout(() => {
                    if (lastCenterTap && Date.now() - lastCenterTap >= 300) {
                        hapticTap();
                        ipodAction('select');
                        lastCenterTap = 0;
                    }
                }, 300);
            }
        });
    }

    function ipodAction(dir) {
        const list = playlistsForHome();
        // MENU = 返回上一级；左右 = 移动选项；下键 play = 播放/暂停；SELECT = 进入/播放
        if (ipodMode === 'pl') {
            if (dir === 'menu') return; // 已在顶层
            if (dir === 'prev') {
                ipodSel = (ipodSel - 1 + Math.max(list.length, 1)) % Math.max(list.length, 1);
                renderIpodList();
                return;
            }
            if (dir === 'next') {
                ipodSel = (ipodSel + 1) % Math.max(list.length, 1);
                renderIpodList();
                return;
            }
            if (dir === 'play') { togglePlay(); return; }
            if (dir === 'select' && list[ipodSel]) {
                currentPlaylistId = list[ipodSel].id;
                ipodMode = 'tracks';
                ipodTrackSel = 0;
                renderIpodList();
            }
            return;
        }
        if (ipodMode === 'tracks') {
            const pl = getCurrentPlaylist();
            const tracks = (pl && pl.tracks) || [];
            if (dir === 'menu') {
                ipodMode = 'pl';
                renderIpodList();
                return;
            }
            if (dir === 'prev') {
                ipodTrackSel = (ipodTrackSel - 1 + Math.max(tracks.length, 1)) % Math.max(tracks.length, 1);
                renderIpodList();
                return;
            }
            if (dir === 'next') {
                ipodTrackSel = (ipodTrackSel + 1) % Math.max(tracks.length, 1);
                renderIpodList();
                return;
            }
            if (dir === 'play') { togglePlay(); return; }
            if (dir === 'select' && tracks[ipodTrackSel]) {
                currentTrackIndex = ipodTrackSel;
                playTrack(tracks[ipodTrackSel]);
                // 进入歌曲页（封面+歌词）
                ipodMode = 'now';
                setTimeout(() => renderIpodNow(), 80);
            }
            if (dir === 'select-double') {
                ipodMode = 'now';
                renderIpodNow();
            }
            return;
        }
        if (ipodMode === 'now') {
            if (dir === 'menu') {
                ipodMode = 'tracks';
                renderIpodList();
                return;
            }
            if (dir === 'prev') {
                playPrev();
                setTimeout(() => renderIpodNow(), 120);
                return;
            }
            if (dir === 'next') {
                playNext();
                setTimeout(() => renderIpodNow(), 120);
                return;
            }
            if (dir === 'play' || dir === 'select') {
                togglePlay();
                return;
            }
            if (dir === 'select-double') {
                ipodMode = 'tracks';
                renderIpodList();
            }
        }
    }

    function renderIpodList() {
        ensureHomeExtras();
        const box = panel.querySelector('#xmp-ipod-list');
        const now = panel.querySelector('#xmp-ipod-now');
        const browse = panel.querySelector('#xmp-ipod-browse');
        const thumb = panel.querySelector('#xmp-ipod-browse-cover');
        if (now) now.classList.remove('show');
        if (browse) browse.style.display = 'flex';
        if (box) box.style.display = '';
        let coverUrl = '';
        if (ipodMode === 'pl') {
            const list = playlistsForHome();
            box.innerHTML = list.map((pl, i) =>
                '<div class="xmp-ipod-item' + (i === ipodSel ? ' sel' : '') + '"><span>' + escHtml(pl.name) + '</span><span>›</span></div>'
            ).join('') || '<div class="xmp-ipod-item">无歌单</div>';
            const cur = list[ipodSel];
            if (cur) coverUrl = cur.cover || (cur.tracks[0] && cur.tracks[0].cover) || '';
        } else {
            const pl = getCurrentPlaylist();
            const tracks = (pl && pl.tracks) || [];
            box.innerHTML = tracks.map((tr, i) =>
                '<div class="xmp-ipod-item' + (i === ipodTrackSel ? ' sel' : '') + '"><span>' + escHtml(tr.customTitle || tr.title || '未知') + '</span></div>'
            ).join('') || '<div class="xmp-ipod-item">空歌单</div>';
            const tr = tracks[ipodTrackSel];
            coverUrl = (tr && tr.cover) || (pl && pl.cover) || '';
        }
        if (thumb) {
            thumb.innerHTML = coverUrl
                ? '<img src="' + escHtml(coverUrl) + '" referrerpolicy="no-referrer" alt="">'
                : '';
        }
        // 选中项滚入可视区
        try {
            const sel = box && box.querySelector('.xmp-ipod-item.sel');
            if (sel && typeof sel.scrollIntoView === 'function') {
                sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        } catch (_) {}
    }

    function renderIpodNow() {
        const browse = panel.querySelector('#xmp-ipod-browse');
        const now = panel.querySelector('#xmp-ipod-now');
        const cover = panel.querySelector('#xmp-ipod-now-cover');
        const ly = panel.querySelector('#xmp-ipod-now-ly');
        if (browse) browse.style.display = 'none';
        if (now) now.classList.add('show');
        if (cover) {
            const c = (currentTrack && currentTrack.cover) || '';
            cover.innerHTML = c ? '<img src="' + escHtml(c) + '" referrerpolicy="no-referrer">' : '';
        }
        const paintLy = () => {
            if (!ly || ipodMode !== 'now') return;
            const lines = (typeof lyLines !== 'undefined' && lyLines && lyLines.length) ? lyLines : [];
            if (!lines.length) {
                ly.innerHTML = '<div style="opacity:.55;padding:12px">暂无歌词</div>';
                return;
            }
            ly.innerHTML = lines.map(l => '<div class="xmp-ipod-ly-line">' + escHtml(l.text || '') + '</div>').join('');
            try {
                if (audio) {
                    let idx = 0;
                    const ct = audio.currentTime || 0;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].time <= ct) idx = i;
                    }
                    const nodes = ly.children;
                    if (nodes[idx]) {
                        nodes[idx].style.color = '#fff';
                        nodes[idx].style.fontWeight = '700';
                        const top = nodes[idx].offsetTop - ly.clientHeight * 0.35;
                        ly.scrollTop = Math.max(0, top);
                    }
                }
            } catch (_) {}
        };
        if (ly) ly.innerHTML = '<div style="opacity:.55;padding:12px">加载歌词中…</div>';
        // 不依赖歌词全屏页 DOM：直接拉词写入 lyLines
        (async () => {
            try {
                try { lyEnsure(); } catch (_) {}
                if (!currentTrack) { paintLy(); return; }
                // 强制重新拉取当前曲歌词
                await lyLoad(currentTrack);
                paintLy();
            } catch (e) {
                console.warn('[ipod lyric]', e);
                if (ly) ly.innerHTML = '<div style="opacity:.55;padding:12px">歌词获取失败</div>';
            }
        })();
    }

    function renderIpodHome() {
        ensureHomeExtras();
        const car = panel.querySelector('#xmp-carousel-home');
        const ipod = panel.querySelector('#xmp-ipod-home');
        if (car) car.classList.remove('show');
        if (!ipod) return;
        ipod.classList.add('show');
        ipodMode = 'pl';
        renderIpodList();
    }

    function bindAmPlayerInteractions() {
        if (!panel || panel.dataset.amBound) return;
        panel.dataset.amBound = '1';
        const cover = panel.querySelector('#xmp-cover');
        if (cover) {
            cover.addEventListener('click', () => {
                if (!currentTrack) return;
                openLyricPage();
            });
        }
        const more = panel.querySelector('#xmp-am-more');
        if (more) more.addEventListener('click', (e) => { e.stopPropagation(); openAmSheet(); });
        const miniBar = panel.querySelector('#xmp-mini-bar');
        if (miniBar && !miniBar.dataset.openPlayer) {
          miniBar.dataset.openPlayer = '1';
          miniBar.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (!currentTrack) return;
            switchAppView('player');
          });
        }

        const dismiss = panel.querySelector('#xmp-am-dismiss');
        if (dismiss) dismiss.addEventListener('click', () => switchAppView('home'));
        const loopBtn = panel.querySelector('#xmp-am-loop');
        if (loopBtn) {
            loopBtn.addEventListener('click', () => {
                loopMode = loopMode === 'list' ? 'single' : loopMode === 'single' ? 'shuffle' : 'list';
                saveState();
                updateLoopModeUI();
                showToast('循环: ' + (loopMode === 'list' ? '列表' : loopMode === 'single' ? '单曲' : '随机'));
            });
        }
    }

    function bindNcmLibrarySearch() {
        if (!panel) return;
        const input = panel.querySelector('#xmp-ncm-search-input');
        const btn = panel.querySelector('#xmp-ncm-search-btn');
        const box = panel.querySelector('#xmp-ncm-search-results');
        if (!input || !btn || !box) return;
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        const run = async () => {
            const q = (input.value || '').trim();
            if (!q) { showToast('请输入关键词'); return; }
            box.innerHTML = '<div class="xmp-playlist-empty">搜索中…</div>';
            const data = await ncmSearchSongs(q, 30);
            if (!data || !data.ok) {
                box.innerHTML = '<div class="xmp-playlist-empty">' + escHtml((data && data.message) || '搜索失败') + '</div>';
                return;
            }
            const songs = data.songs || data.tracks || [];
            if (!songs.length) {
                box.innerHTML = '<div class="xmp-playlist-empty">无结果</div>';
                return;
            }
            box.innerHTML = songs.map((s, i) => {
                const id = s.id || s.neteaseId || '';
                const title = s.name || s.title || '未知';
                const artist = s.artist || s.arName || '';
                const cover = s.cover || s.picUrl || '';
                return '<div class="xmp-ncm-result-item" data-i="' + i + '">' +
                    (cover ? '<img src="' + escHtml(cover) + '" referrerpolicy="no-referrer" alt="">' : '<div style="width:48px;height:48px;border-radius:6px;background:rgba(128,128,128,.2)"></div>') +
                    '<div class="xmp-ncm-result-meta"><div class="xmp-ncm-result-title">' + escHtml(title) + '</div>' +
                    '<div class="xmp-ncm-result-sub">' + escHtml(artist) + '</div></div>' +
                    '<button type="button" class="xmp-ncm-add-btn" data-add="' + i + '">添加</button></div>';
            }).join('');
            box._ncmSongs = songs;
            box.querySelectorAll('[data-add]').forEach(b => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const songs2 = box._ncmSongs || [];
                    const s = songs2[Number(b.dataset.add)];
                    if (!s) return;
                    const pl = getCurrentPlaylist() || playlists[0];
                    if (!pl) { showToast('请先创建歌单'); return; }
                    const track = (typeof ncmItemToTrack === 'function')
                        ? ncmItemToTrack(s)
                        : {
                            id: uid('ncm'), type: 'netease',
                            neteaseId: String(s.id || s.neteaseId || ''),
                            title: s.name || s.title || '未知',
                            artist: s.artist || '',
                            cover: s.cover || s.picUrl || '',
                            source: '网易云音乐'
                        };
                    if (!track.neteaseId) { showToast('无效歌曲'); return; }
                    const dup = pl.tracks.some(x => x.type === 'netease' && String(x.neteaseId) === String(track.neteaseId));
                    if (dup) { showToast('歌单中已有此曲'); return; }
                    pl.tracks.push(track);
                    pl.updatedAt = Date.now();
                    if (!pl.cover && track.cover) pl.cover = track.cover;
                    savePlaylists();
                    showToast('已添加到「' + pl.name + '」');
                });
            });
        };
        btn.addEventListener('click', (e) => { e.preventDefault(); run(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); run(); } });
        input.addEventListener('search', (e) => { e.preventDefault(); run(); });
    }

    function setPlaylistPageMode(mode) {
        playlistPageMode = mode;
        const root = panel && panel.querySelector('#xmp-playlist-view-root');
        if (!root) return;
        root.classList.remove('list-mode', 'detail-mode', 'personal-mode');
        root.classList.add(mode === 'personal' ? 'personal-mode' : (mode === 'detail' ? 'detail-mode' : 'list-mode'));
        const page = panel.querySelector('#xmp-pl-page');
        const detail = panel.querySelector('#xmp-pl-detail');
        if (mode === 'list') {
            if (page) page.style.display = '';
            if (detail) detail.style.display = 'none';
        } else {
            if (page) page.style.display = 'none';
            if (detail) detail.style.display = 'flex';
        }
    }

    function openPlaylistDetail(plId) {
        currentPlaylistId = plId;
        currentTrackIndex = -1;
        saveState();
        setPlaylistPageMode(plId === STATS_PLAYLIST_ID ? 'personal' : 'detail');
        const titleEl = panel.querySelector('#xmp-pl-detail-title');
        if (titleEl) {
            if (plId === STATS_PLAYLIST_ID) titleEl.textContent = '听歌排行';
            else {
                const pl = playlists.find(p => p.id === plId);
                titleEl.textContent = pl ? pl.name : '歌单';
            }
        }
        // 个人页隐藏搜索与循环工具栏中与歌单操作无关的部分在 render 里处理
        const searchWrap = panel.querySelector('#xmp-search-wrap');
        const toolbar = panel.querySelector('#xmp-playlist-toolbar');
        if (plId === STATS_PLAYLIST_ID) {
            if (searchWrap) searchWrap.style.display = 'none';
            if (toolbar) toolbar.style.display = 'none';
        } else {
            if (searchWrap) searchWrap.style.display = '';
            if (toolbar) toolbar.style.display = '';
        }
        renderPlaylistHead();
        renderPlaylist();
        updateLoopModeUI();
    }

    function closePlaylistDetail() {
        setPlaylistPageMode('list');
        renderPlaylistTabs();
    }

    function renderPlaylistTabs() {
        if (!panel) return;
        // 卡片列表
        const list = panel.querySelector('#xmp-pl-card-list');
        if (list) {
            let html = '';
            // 听歌统计仅在「个人」页，歌单列表不展示
            for (const pl of playlists) {
                const cover = pl.cover
                    ? '<img src="' + escHtml(pl.cover) + '" alt="" referrerpolicy="no-referrer">'
                    : ICON_MUSIC;
                const wallHint = pl.showOnWall === false ? ' · 不在唱片墙' : '';
                const skipHint = pl.excludeFromStats ? ' · 不计入统计' : '';
                html += '<div class="xmp-pl-card" data-pl-id="' + escHtml(pl.id) + '">' +
                    '<div class="xmp-pl-card-cover">' + cover + '</div>' +
                    '<div class="xmp-pl-card-body"><div class="xmp-pl-card-name">' + escHtml(pl.name) + '</div>' +
                    '<div class="xmp-pl-card-meta">' + pl.tracks.length + ' 首' + wallHint + skipHint + '</div></div>' +
                    '<div class="xmp-pl-card-arrow">›</div></div>';
            }
            list.innerHTML = html;
            list.querySelectorAll('.xmp-pl-card').forEach(el => {
                el.addEventListener('click', () => openPlaylistDetail(el.dataset.plId));
            });
        }
        // 兼容旧 tabs 容器（隐藏）
        const tabsEl = panel.querySelector('#xmp-playlist-tabs');
        if (tabsEl) tabsEl.innerHTML = '';
    }

    function renderStatsPlaylistHead() {
        const headWrap = panel.querySelector('#xmp-playlist-head-wrap');
        if (!headWrap) return;
        const aggs = { all: aggregateStats('all'), week: aggregateStats('week'), month: aggregateStats('month'), year: aggregateStats('year') };
        const cards = [['all', '累计'], ['week', '本周'], ['month', '本月'], ['year', '本年']]
            .map(([k, label]) => `
            <div class="xmp-stats-card ${statsRange === k ? 'active' : ''}" data-range="${k}">
                <div class="xmp-stats-card-label">${label}</div>
                <div class="xmp-stats-card-value">${formatDuration(aggs[k].totalSec)}</div>
                <div class="xmp-stats-card-sub">${aggs[k].totalPlays} 次播放</div>
            </div>
        `).join('');
        headWrap.innerHTML = `
            <div class="xmp-stats-summary">
                <div class="xmp-stats-title">
                  ${ICON_STATS} 听歌排行
                  <button type="button" class="xmp-hours-entry" id="xmp-hours-entry">时段统计 →</button>
                </div>
                <div class="xmp-stats-cards">${cards}</div>
                <div class="xmp-stats-hint">点击卡片切换统计区间，下方列表按播放次数排序</div>
            </div>
        `;
        const hoursEntry = headWrap.querySelector('#xmp-hours-entry');
        if (hoursEntry) hoursEntry.addEventListener('click', (e) => { e.stopPropagation(); openHoursView(); });
        headWrap.querySelectorAll('.xmp-stats-card').forEach(el => {
            el.addEventListener('click', () => {
                statsRange = el.dataset.range;
                renderStatsPlaylistHead();
                renderStatsPlaylist();
            });
        });
    }

    function renderStatsPlaylist() {
        const list = panel.querySelector('#xmp-playlist-list');
        if (!list) return;
        const agg = aggregateStats(statsRange);
        const arr = [];
        for (const tid in agg.trackAgg) {
            const td = agg.trackAgg[tid];
            if (!td || (td.plays <= 0 && td.sec <= 0)) continue;
            const meta = stats.tracks[tid] || {};
            const found = findTrackById(tid);
            const title = found ? (found.track.customTitle || found.track.title) : (meta.title || '未知歌曲');
            const source = found ? found.track.source : (meta.source || '');
            arr.push({ tid, plays: td.plays, sec: td.sec, title: title || '未知歌曲', source: source || '', found: !!found });
        }
        arr.sort((a, b) => (b.plays - a.plays) || (b.sec - a.sec));
        if (!arr.length) { list.innerHTML = `<div class="xmp-playlist-empty">暂无收听记录<br>开始播放歌曲后这里会显示排行</div>`; return; }
        list.innerHTML = arr.map((e, i) => `
            <div class="xmp-track-item ${e.found ? '' : 'disabled'}" data-tid="${e.tid}">
                <div class="xmp-track-index">${i + 1}</div>
                <div class="xmp-track-info">
                    <div class="xmp-track-name">${escHtml(e.title)}</div>
                    <div class="xmp-track-source">播放 ${e.plays} 次 · ${formatDuration(e.sec)}${e.source ? ' · ' + escHtml(e.source) : ''}</div>
                </div>
                <div class="xmp-track-actions">
                    <button type="button" class="xmp-track-action" data-action="del-stat" title="删除本条听歌数据">⌫</button>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('.xmp-track-item').forEach(el => {
            el.addEventListener('click', (ev) => {
                if (ev.target.closest('[data-action="del-stat"]')) return;
                const tid = el.dataset.tid;
                const found = findTrackById(tid);
                if (!found) { showToast('该歌曲已不在任何歌单中'); return; }
                currentPlaylistId = found.playlist.id;
                currentTrackIndex = found.index;
                saveState();
                renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist();
                playTrack(found.track);
            });
        });
        list.querySelectorAll('[data-action="del-stat"]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const item = btn.closest('.xmp-track-item');
                const tid = item && item.dataset.tid;
                if (!tid) return;
                if (!window.confirm('删除该曲的全部听歌次数与时长？此操作会同步到云端。')) return;
                if (deleteTrackStats(tid)) {
                    showToast('已删除听歌数据');
                    renderStatsPlaylistHead();
                    renderStatsPlaylist();
                    try { if (typeof syncStatsNow === 'function') syncStatsNow(); } catch (_) {}
                    try { if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); } catch (_) {}
                } else showToast('删除失败');
            });
        });
    }

    function renderSearchResults(query) {
        const list = panel.querySelector('#xmp-playlist-list');
        if (!list) return;
        const q = query.toLowerCase();
        const results = [];
        for (const pl of playlists) {
            for (let i = 0; i < pl.tracks.length; i++) {
                const t = pl.tracks[i];
                const title = (t.customTitle || t.title || '').toLowerCase();
                const artist = (t.artist || '').toLowerCase();
                const alias = (t.alias || t.tns || t.transName || t.nameTrans || '').toLowerCase();
                const source = (t.source || '').toLowerCase();
                const fileName = (t.fileName || '').toLowerCase();
                const owner = (t.owner || '').toLowerCase();
                const hay = title + ' ' + artist + ' ' + alias + ' ' + owner + ' ' + source + ' ' + fileName;
                let score = -1;
                if (title === q || alias === q) score = 1000;
                else if (title.startsWith(q) || alias.startsWith(q)) score = 800;
                else if (title.includes(q) || alias.includes(q)) score = 650;
                else if (artist.includes(q)) score = 500;
                else if (owner.includes(q)) score = 450;
                else if (source.includes(q)) score = 400;
                else if (fileName.includes(q)) score = 350;
                else if (hay.includes(q)) score = 300;
                if (score < 0) continue;
                score += Math.max(0, 60 - title.length);
                results.push({ track: t, playlist: pl, index: i, score });
            }
        }
        results.sort((a, b) => b.score - a.score);
        if (!results.length) { list.innerHTML = `<div class="xmp-playlist-empty">未找到匹配的歌曲</div>`; return; }
        list.innerHTML = `<div class="xmp-search-section-title">找到 ${results.length} 首</div>` +
            results.map(r => {
                const t = r.track;
                const displayTitle = t.customTitle || t.title || '未知';
                const displaySource = t.source || (t.type === 'bilibili' ? 'B站' : '本地文件');
                const isCurrent = currentTrack && currentTrack.id === t.id;
                return `<div class="xmp-track-item ${isCurrent ? 'current' : ''}" data-pl-id="${r.playlist.id}" data-idx="${r.index}">
                    <div class="xmp-track-index">${isCurrent && isPlaying ? '▶' : ''}</div>
                    <div class="xmp-track-info">
                        <div class="xmp-track-name">${escHtml(displayTitle)}</div>
                        <div class="xmp-track-source">${escHtml(displaySource)} · 📁 ${escHtml(r.playlist.name)}</div>
                    </div>
                </div>`;
            }).join('');
        list.querySelectorAll('.xmp-track-item').forEach(el => {
            el.addEventListener('click', () => {
                const plId = el.dataset.plId;
                const idx = Number(el.dataset.idx);
                const pl = playlists.find(p => p.id === plId);
                if (!pl) return;
                currentPlaylistId = plId;
                currentTrackIndex = idx;
                saveState();
                const si = panel.querySelector('#xmp-search-input');
                if (si) si.value = '';
                renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist();
                playTrack(pl.tracks[idx]);
            });
        });
    }

    function renderPlaylistHead() {
        if (!panel) return;
        const headWrap = panel.querySelector('#xmp-playlist-head-wrap');
        if (currentPlaylistId === STATS_PLAYLIST_ID) {
            renderStatsPlaylistHead();
            const toolbar = panel.querySelector('#xmp-playlist-toolbar');
            if (toolbar) toolbar.style.display = 'none';
            const sw = panel.querySelector('#xmp-search-wrap');
            if (sw) sw.style.display = 'none';
            return;
        }
        // 从统计页返回后，headWrap 可能被整块替换，需重建结构
        if (headWrap && !panel.querySelector('#xmp-playlist-head')) {
            headWrap.innerHTML = '<div class="xmp-playlist-head" id="xmp-playlist-head"></div>';
        }
        const toolbar = panel.querySelector('#xmp-playlist-toolbar');
        if (toolbar) toolbar.style.display = '';
        const sw = panel.querySelector('#xmp-search-wrap');
        if (sw) sw.style.display = '';

        const headEl = panel.querySelector('#xmp-playlist-head');
        if (!headEl) return;
        const pl = getCurrentPlaylist();
        if (!pl) { headEl.innerHTML = ''; return; }
        const coverContent = pl.cover ? `<img src="${escHtml(pl.cover)}" alt="">` : `<div class="xmp-playlist-cover-placeholder">${ICON_MUSIC_LARGE}</div>`;
        const wallOn = pl.showOnWall !== false;
        headEl.innerHTML = `
<div class="xmp-playlist-cover" id="xmp-playlist-cover-btn" title="点击更换封面">${coverContent}<div class="xmp-playlist-cover-overlay">更换</div></div>
<div class="xmp-playlist-info">
<div class="xmp-playlist-name" id="xmp-playlist-name" title="点击重命名"><span class="xmp-playlist-name-text">${escHtml(pl.name)}</span>${ICON_EDIT}</div>
<div class="xmp-playlist-count">${pl.tracks.length} 首</div>
</div>
<div class="xmp-playlist-actions"><button type="button" class="xmp-playlist-action" id="xmp-playlist-delete-btn" title="删除歌单">${ICON_TRASH}</button></div>
<div class="xmp-wall-toggle-row" id="xmp-wall-toggle-row">
<label class="xmp-wall-toggle-label"><input type="checkbox" id="xmp-pl-wall-toggle" ${wallOn ? 'checked' : ''}><span>展示在唱片墙</span></label>
<div class="xmp-wall-toggle-hint">关闭后该歌单封面不出现在首页唱片墙，也无法从墙点击播放</div>
</div>
<div class="xmp-wall-toggle-row" id="xmp-stats-toggle-row">
<label class="xmp-wall-toggle-label"><input type="checkbox" id="xmp-pl-stats-toggle" ${pl.excludeFromStats ? 'checked' : ''}><span>不计入听歌统计</span></label>
<div class="xmp-wall-toggle-hint">开启后播放本歌单不写入听歌数据，并随歌单云同步</div>
</div>`;
        headEl.querySelector('#xmp-playlist-cover-btn').addEventListener('click', () => {
            pickImage((dataUrl) => { pl.cover = dataUrl; pl.updatedAt = Date.now(); savePlaylists(); renderPlaylistTabs(); renderPlaylistHead(); scheduleAutoSync(); });
        });
        headEl.querySelector('#xmp-playlist-name').addEventListener('click', () => startRenamePlaylist(pl));
        headEl.querySelector('#xmp-playlist-delete-btn').addEventListener('click', () => deletePlaylist(pl.id));
        const wallToggle = headEl.querySelector('#xmp-pl-wall-toggle');
        if (wallToggle) wallToggle.addEventListener('change', () => {
            pl.showOnWall = !!wallToggle.checked;
            pl.updatedAt = Date.now();
            savePlaylists();
            try { renderWall(); } catch (_) {}
            showToast(pl.showOnWall ? '已在唱片墙展示该歌单' : '已从唱片墙隐藏该歌单');
        });
        const statsToggle = headEl.querySelector('#xmp-pl-stats-toggle');
        if (statsToggle) {
            statsToggle.addEventListener('change', () => {
                pl.excludeFromStats = !!statsToggle.checked;
                pl.updatedAt = Date.now();
                savePlaylists();
                try { if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); } catch (_) {}
                showToast(pl.excludeFromStats ? '本歌单已不计入听歌统计' : '本歌单将计入听歌统计');
            });
        }
    }

    function startRenamePlaylist(pl) {
        if (!panel) return;
        const nameEl = panel.querySelector('#xmp-playlist-name');
        if (!nameEl) return;
        nameEl.innerHTML = `<input type="text" class="xmp-playlist-name-input" value="${escHtml(pl.name)}" maxlength="30">`;
        const input = nameEl.querySelector('input');
        input.focus(); input.select();
        const commit = () => { pl.name = input.value.trim() || pl.name; pl.updatedAt = Date.now(); savePlaylists(); renderPlaylistTabs(); renderPlaylistHead(); scheduleAutoSync(); };
        const cancel = () => renderPlaylistHead();
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); input.value = pl.name; cancel(); }
        });
    }

    function renderPlaylist() {
        if (!panel) return;
        const list = panel.querySelector('#xmp-playlist-list');
        if (!list) return;
        if (currentPlaylistId === STATS_PLAYLIST_ID) return renderStatsPlaylist();

        const searchInput = panel.querySelector('#xmp-search-input');
        const q = searchInput ? searchInput.value.trim() : '';
        if (q) return renderSearchResults(q);

        const pl = getCurrentPlaylist();
        if (!pl) { list.innerHTML = `<div class="xmp-playlist-empty">请先创建一个歌单</div>`; return; }
        if (pl.tracks.length === 0) { list.innerHTML = `<div class="xmp-playlist-empty">歌单为空<br>切换到「添加」标签页添加歌曲</div>`; return; }
        let html = '';
        pl.tracks.forEach((track, idx) => {
            const isCurrent = idx === currentTrackIndex && currentTrack && currentTrack.id === track.id;
            const displayTitle = track.customTitle || track.title || '未知';
            const displaySource = track.source || (track.type === 'bilibili' ? 'B站' : (track.type === 'netease' ? '网易云音乐' : '本地文件'));
            const tkStats = stats.tracks[track.id];
            const statText = tkStats ? ` · ${tkStats.plays}次` : '';
            html += `<div class="xmp-track-item ${isCurrent ? 'current' : ''}" data-idx="${idx}" data-tid="${track.id}"><div class="xmp-track-index">${isCurrent && isPlaying ? '▶' : idx + 1}</div><div class="xmp-track-info"><div class="xmp-track-name">${escHtml(displayTitle)}</div><div class="xmp-track-source">${escHtml(displaySource)}${statText}</div></div><div class="xmp-track-actions"><button type="button" class="xmp-track-action" data-action="edit" title="编辑">${ICON_EDIT}</button><button type="button" class="xmp-track-action" data-action="remove" title="移除">${ICON_CROSS}</button></div></div>`;
        });
        list.innerHTML = html;
        list.querySelectorAll('.xmp-track-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                const idx = Number(el.dataset.idx);
                currentTrackIndex = idx; saveState(); playTrack(pl.tracks[idx]);
            });
        });
        list.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = el.dataset.action;
                const item = el.closest('.xmp-track-item');
                const tid = item.dataset.tid;
                if (action === 'edit') startEditTrack(tid, item);
                else if (action === 'remove') removeTrackFromPlaylist(pl.id, tid);
            });
        });
    }

    function startEditTrack(trackId, itemEl) {
        const pl = getCurrentPlaylist();
        if (!pl) return;
        const track = pl.tracks.find(t => t.id === trackId);
        if (!track) return;
        const infoEl = itemEl.querySelector('.xmp-track-info');
        infoEl.outerHTML = `<div class="xmp-track-edit"><input type="text" class="xmp-track-edit-title" value="${escHtml(track.customTitle || track.title)}" placeholder="自定义标题" maxlength="80"><input type="text" class="xmp-track-edit-source" value="${escHtml(track.source)}" placeholder="来源" maxlength="60"></div>`;
        const editEl = itemEl.querySelector('.xmp-track-edit');
        const titleInput = editEl.querySelector('.xmp-track-edit-title');
        const sourceInput = editEl.querySelector('.xmp-track-edit-source');
        itemEl.insertAdjacentHTML('beforeend', `<div class="xmp-track-edit-actions"><button type="button" class="xmp-track-edit-btn ok" title="保存">✓</button><button type="button" class="xmp-track-edit-btn cancel" title="取消">✕</button></div>`);
        const okBtn = itemEl.querySelector('.xmp-track-edit-btn.ok');
        const cancelBtn = itemEl.querySelector('.xmp-track-edit-btn.cancel');
        titleInput.focus();
        titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        const commit = () => {
            const newTitle = titleInput.value.trim();
            const newSource = sourceInput.value.trim();
            track.customTitle = (newTitle && newTitle !== track.title) ? newTitle : '';
            track.source = newSource;
            track.updatedAt = Date.now();
            pl.updatedAt = Date.now();
            savePlaylists(); renderPlaylist(); updateNowPlayingUI(); notifyNativePlayState();
            scheduleAutoSync();
        };
        const cancel = () => renderPlaylist();
        okBtn.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cancel(); });
        [titleInput, sourceInput].forEach(inp => {
            inp.addEventListener('click', (e) => e.stopPropagation());
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });
        });
    }

    function updateLoopModeUI() {
        if (!panel) return;
        panel.querySelectorAll('.xmp-loop-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.loop === loopMode));
    }
    function updatePlayButton() {
        if (!panel) return;
        const btn = panel.querySelector('#xmp-play-btn');
        const st = isPlaying ? '1' : '0';
        if (btn && btn.dataset.st !== st) { btn.dataset.st = st; btn.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY; }
        const mini = panel.querySelector('#xmp-mini-play');
        if (mini && mini.dataset.st !== st) { mini.dataset.st = st; mini.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY; }
        try { updateLyricPlayBtn(); } catch (_) { }
    }
    function updateFabIcon() {
        if (!fab) return;
        const iconEl = fab.querySelector('.xmp-fab-icon');
        if (!iconEl) return;
        if (isPlaying) {
            iconEl.innerHTML = ICON_PAUSE_SMALL;
            let ring = fab.querySelector('.xmp-fab-playing-ring');
            if (!ring) { ring = document.createElement('div'); ring.className = 'xmp-fab-playing-ring'; fab.appendChild(ring); }
        } else {
            iconEl.innerHTML = ICON_MUSIC;
            const ring = fab.querySelector('.xmp-fab-playing-ring');
            if (ring) ring.remove();
        }
    }
    function updateVinylSpin(spinning) {
        if (!panel) return;
        const vinyl = panel.querySelector('#xmp-vinyl');
        const arm = panel.querySelector('#xmp-vinyl-arm');
        if (vinyl) vinyl.classList.toggle('spinning', !!spinning);
        if (arm) arm.classList.toggle('playing', !!spinning);
    }
    function updateNowPlayingUI() {
        try {
            if (typeof ipodMode !== 'undefined' && ipodMode === 'now') {
                try { renderIpodNow(); } catch (_) {}
            }
            const amBg = panel && panel.querySelector('#xmp-am-bg');
            if (amBg) {
                const c = currentTrack && currentTrack.cover;
                amBg.style.backgroundImage = c ? ('url("' + c + '")') : '';
            }
            updateAmLineLyric();
        } catch (_) {}

        if (!panel) return;
        try { updateMiniBar(); } catch (_) {}
        const titleEl = panel.querySelector('#xmp-now-title');
        const artistEl = panel.querySelector('#xmp-now-artist');
        const coverEl = panel.querySelector('#xmp-cover');
        const vinylLabel = panel.querySelector('#xmp-vinyl-label');
        const bgLayer = panel.querySelector('.xmp-bg-image');
        const dimLayer = panel.querySelector('.xmp-bg-dim');
        if (!titleEl || !artistEl || !coverEl) return;
        const isVinyl = settings.playerStyle === 'vinyl';
        if (!currentTrack) {
            titleEl.textContent = '未在播放';
            artistEl.textContent = '添加歌曲开始播放';
            coverEl.innerHTML = `<div class="xmp-cover-placeholder">${ICON_MUSIC_LARGE}</div>`;
            if (vinylLabel) vinylLabel.innerHTML = `<div class="xmp-vinyl-label-placeholder">${ICON_MUSIC_LARGE}</div>`;
            if (isVinyl && bgLayer) {
                if (settings.bgImage) { bgLayer.style.backgroundImage = `url('${settings.bgImage}')`; if (dimLayer) dimLayer.style.background = `rgba(0,0,0,${settings.bgImageDim / 100})`; }
                else { bgLayer.style.backgroundImage = ''; if (dimLayer) dimLayer.style.background = 'transparent'; }
            }
            return;
        }
        const displayTitle = currentTrack.customTitle || currentTrack.title || '未知歌曲';
        const displaySource = currentTrack.source || (currentTrack.type === 'bilibili' ? (currentTrack.owner || 'B站') : (currentTrack.type === 'netease' ? (currentTrack.artist || '网易云音乐') : (currentTrack.fileName || '本地文件')));
        titleEl.textContent = displayTitle;
        artistEl.textContent = displaySource;
        if (currentTrack.cover) coverEl.innerHTML = `<img src="${escHtml(currentTrack.cover)}" alt="" referrerpolicy="no-referrer">`;
        else coverEl.innerHTML = `<div class="xmp-cover-placeholder">${ICON_MUSIC_LARGE}</div>`;
        if (vinylLabel) {
            if (currentTrack.cover) vinylLabel.innerHTML = `<img src="${escHtml(currentTrack.cover)}" alt="" referrerpolicy="no-referrer">`;
            else vinylLabel.innerHTML = `<div class="xmp-vinyl-label-placeholder">${ICON_MUSIC_LARGE}</div>`;
        }
        if (isVinyl && bgLayer) {
            const useBg = currentTrack.cover || settings.bgImage;
            if (useBg) { bgLayer.style.backgroundImage = `url('${useBg}')`; if (dimLayer) dimLayer.style.background = `rgba(0,0,0,${settings.bgImageDim / 100})`; }
            else { bgLayer.style.backgroundImage = ''; if (dimLayer) dimLayer.style.background = 'transparent'; }
        }
    }

    /* ========== 设置 UI ========== */
    function renderSettingsUI() {
        // Apple 风格分组容器
        try {
            const body = panel && panel.querySelector('#xmp-view-settings .xmp-settings-body, #xmp-settings-body, .xmp-settings-body');
            if (body) body.classList.add('xmp-settings-am');
        } catch (_) {}

        if (!panel) return;
        const body = panel.querySelector('#xmp-settings-body');
        if (!body) return;
        let html = '';
        for (const def of SETTING_DEFS) {
            if (def.group) { html += `<div class="xmp-setting-group">${def.group}</div>`; continue; }
            const val = settings[def.key];
            html += `<div class="xmp-setting-row"><label>${def.label}</label><div class="xmp-setting-control">`;
            if (def.type === 'colorTheme') {
                const cur = settings.colorTheme || 'ocean';
                html += `</div></div>`;
                html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;margin-top:-8px;">`;
                html += `<div class="xmp-color-grid">`;
                for (const t of COLOR_THEMES) {
                    const active = cur === t.id ? ' active' : '';
                    html += `<button type="button" class="xmp-color-swatch${active}" data-color-theme="${t.id}" style="background:${t.grad}" title="${t.name}"><span>${t.name}</span></button>`;
                }
                html += `</div></div>`;
                continue;
            } else if (def.type === 'color') {
                html += `<input type="color" data-input="${def.key}" value="${escHtml(val || '#0A84FF')}" style="width:42px;height:28px;border:none;background:transparent;padding:0;">`;
                html += `<span class="xmp-setting-value" data-value="${def.key}">${escHtml(val || '')}</span>`;
            } else if (def.type === 'range') {
                html += `<input type="range" data-input="${def.key}" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}">`;
                html += `<span class="xmp-setting-value" data-value="${def.key}">${val}${def.unit || ''}</span>`;
            } else if (def.type === 'select') {
                html += `<select data-input="${def.key}">`;
                for (const opt of def.options) html += `<option value="${String(opt.v)}"${String(opt.v) === String(val) ? ' selected' : ''}>${opt.t}</option>`;
                html += `</select>`;
            } else if (def.type === 'jizuraFontFile') {
                const name = settings.jizuraFontName || '';
                html += `<button type="button" class="xmp-setting-btn" id="xmp-jizura-font-btn" style="padding:6px 12px;font-size:12px;">${name ? '已导入: ' + name : '选择字体文件'}</button>`;
                if (name) html += `<button type="button" class="xmp-setting-btn" id="xmp-jizura-font-clear" style="padding:6px 10px;font-size:12px;opacity:.75;">清除</button>`;
            }
            html += `</div></div>`;
        }
        html += `<div class="xmp-setting-group">背景图</div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;">`;
        html += `<div style="display:flex;gap:8px;">`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-bg-upload-btn" style="flex:1;">上传背景图</button>`;
        html += `<button type="button" class="xmp-setting-btn danger" id="xmp-bg-clear-btn">清除</button>`;
        html += `</div>`;
        html += `<div class="xmp-setting-preview" id="xmp-bg-preview" style="${settings.bgImage ? `background-image:url('${escHtml(settings.bgImage)}');` : ''}"></div>`;
        html += `</div>`;

        html += `<div class="xmp-setting-group">云同步（WebDAV）</div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;">`;
        html += `<label style="font-size:12px;color:var(--fg-2);">当前账号</label>`;
        html += `<div style="display:flex;gap:6px;align-items:center;">`;
        html += `<select id="xmp-sync-account-select" class="xmp-add-input" style="flex:1;padding:8px 12px;">`;
        for (const c of syncConfigs) html += `<option value="${c.id}"${c.id === activeSyncId ? ' selected' : ''}>${escHtml(c.name || '未命名')}</option>`;
        html += `</select>`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-sync-rename" style="padding:6px 12px;">✎</button>`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-sync-new" style="padding:6px 12px;">＋</button>`;
        html += `<button type="button" class="xmp-setting-btn danger" id="xmp-sync-del" style="padding:6px 12px;">✕</button>`;
        html += `</div></div>`;
        html += `<div class="xmp-setting-row"><label>启用云同步</label><div class="xmp-setting-control"><input type="checkbox" id="xmp-sync-enabled" ${syncConfig.enabled ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent);"></div></div>`;
        html += `<div class="xmp-setting-row"><label>自动同步（30s）</label><div class="xmp-setting-control"><input type="checkbox" id="xmp-sync-auto" ${syncConfig.autoSync ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent);"></div></div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:6px;"><label style="font-size:12px;color:var(--fg-2);">WebDAV 地址</label><input type="text" id="xmp-sync-url" class="xmp-add-input" placeholder="https://dav.jianguoyun.com/dav/music-sync/" value="${escHtml(syncConfig.url)}" autocomplete="off" spellcheck="false"></div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:6px;"><label style="font-size:12px;color:var(--fg-2);">账号（邮箱）</label><input type="text" id="xmp-sync-user" class="xmp-add-input" placeholder="your@email.com" value="${escHtml(syncConfig.user)}" autocomplete="off" spellcheck="false"></div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:6px;"><label style="font-size:12px;color:var(--fg-2);">应用密码</label><input type="password" id="xmp-sync-pass" class="xmp-add-input" placeholder="应用密码" value="${escHtml(syncConfig.pass)}" autocomplete="off" spellcheck="false"></div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;">`;
        html += `<div class="xmp-add-hint">设备 ID：<code>${escHtml(deviceId)}</code><br>最近同步：${syncConfig.lastSyncAt ? new Date(syncConfig.lastSyncAt).toLocaleString('zh-CN') : '从未'} ${syncConfig.lastSyncStatus ? '· ' + escHtml(syncConfig.lastSyncStatus) : ''}</div>`;
        html += `<div style="display:flex;gap:6px;flex-wrap:wrap;">`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-sync-save" style="flex:1;min-width:80px;">保存</button>`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-sync-now" style="flex:1;min-width:80px;">智能合并</button>`;
        html += `</div>`;
        html += `<div style="display:flex;gap:6px;flex-wrap:wrap;">`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-sync-upload" style="flex:1;min-width:80px;">上传到云端</button>`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-sync-download" style="flex:1;min-width:80px;">从云端下载</button>`;
        html += `</div>`;
        html += `<div class="xmp-add-hint">云端文件：<code>${SYNC_FILE_PLAYLISTS}</code>、<code>${SYNC_FILE_STATS}</code>、<code>${SYNC_FILE_HOURLY}</code>。</div>`;
        html += `</div>`;

        html += `<div class="xmp-setting-group">数据管理</div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;">`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-export-btn" style="width:100%;">${ICON_DOWNLOAD} 导出全部数据（JSON）</button>`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-import-btn" style="width:100%;">${ICON_UPLOAD} 从 JSON 文件导入</button>`;
        html += `<input type="file" id="xmp-import-file" accept=".json,application/json" style="display:none">`;
        html += `<div class="xmp-add-hint">导出内容：全部歌单、设置、听歌统计、时段统计。</div>`;
        html += `</div>`;

        html += `<div class="xmp-setting-group">听歌统计</div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;">`;
        html += `<div class="xmp-add-hint">共有 ${Object.keys(stats.tracks).length} 首歌产生了记录，累计 ${formatDuration(aggregateStats('all').totalSec)}</div>`;
        html += `<button type="button" class="xmp-setting-btn danger" id="xmp-reset-stats-btn" style="width:100%;">清空听歌统计</button>`;
        html += `</div>`;

        html += `<div class="xmp-setting-group">危险操作</div>`;
        html += `<div class="xmp-setting-row" style="flex-direction:column;align-items:stretch;gap:8px;">`;
        html += `<button type="button" class="xmp-setting-btn" id="xmp-clear-all-btn" style="width:100%;color:#f87171;border-color:rgba(248,113,113,.35);">⚠️ 清空全部数据</button>`;
        html += `<div class="xmp-add-hint">将清空所有歌单、听歌统计、设置项，可选是否同时清空云端。云同步账号配置会保留。</div>`;
        html += `</div>`;

        body.innerHTML = html;

        body.querySelectorAll('[data-input]').forEach(el => {
            el.addEventListener('input', () => {
                const key = el.dataset.input;
                const def = SETTING_DEFS.find(d => d.key === key);
                let val;
                if (el.type === 'range') {
                    val = Number(el.value);
                    const valEl = body.querySelector(`[data-value="${key}"]`);
                    if (valEl) valEl.textContent = val + (def?.unit || '');
                } else if (el.tagName === 'SELECT') {
                    const opt = def?.options?.find(o => String(o.v) === el.value);
                    val = opt ? opt.v : el.value;
                } else val = el.value;
                settings[key] = val;
                saveSettings(); applySettings();
                if (['wallCoverSize','wallGlow','wallDim','wallBigChance','wallTilt','wallStyle','wallRectHChance','wallRectVChance','wallInertiaMs','wallEdgeBlur','wallEdgeFade','wallEdgeDist'].indexOf(key) >= 0) {
                    wallSettingsDirty = true;
                }
                if (key === 'colorGradStart' || key === 'colorGradEnd' || key === 'colorAccent' || key === 'pageFadeMs' || key === 'useCustomBgColor' || key === 'bgSolidColor' || key === 'navOpacity' || key === 'navBlur' || key === 'cardOpacity' || key === 'cardBlur') {
                    applySettings();
                }
                if (key === 'jizuraFont' && (settings.lyricStyle || '') === 'jizura') {
                    try { if (window.XmpJizuraPlayer) window.XmpJizuraPlayer.invalidate(); } catch (e) {}
                    setTimeout(() => lyJizuraBoot(true), 30);
                }
            });
        });
        body.querySelectorAll('[data-color-theme]').forEach(btn => {
            btn.addEventListener('click', () => {
                settings.colorTheme = btn.dataset.colorTheme;
                const tt = COLOR_THEMES.find(c => c.id === settings.colorTheme);
                if (tt) {
                    settings.colorAccent = tt.accent;
                    settings.colorGradStart = tt.accent;
                    // 从渐变串尽量取第二色，否则用 accent
                    settings.colorGradEnd = tt.accent;
                    const m2 = String(tt.grad || '').match(/#(?:[0-9a-fA-F]{3,8})/g);
                    if (m2 && m2.length >= 2) { settings.colorGradStart = m2[0]; settings.colorGradEnd = m2[m2.length - 1]; }
                }
                body.querySelectorAll('[data-color-theme]').forEach(b => b.classList.toggle('active', b === btn));
                saveSettings(); applySettings();
                renderSettingsUI();
                showToast('已应用主题色');
            });
        });


        const jzFontBtn = body.querySelector('#xmp-jizura-font-btn');
        if (jzFontBtn) jzFontBtn.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf';
            inp.onchange = () => {
                const f = inp.files && inp.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const fam = 'XmpJizuraCustom';
                        const face = new FontFace(fam, 'url(' + reader.result + ')');
                        face.load().then((loaded) => {
                            document.fonts.add(loaded);
                            settings.jizuraFontCustom = String(reader.result).slice(0, 50) === 'data:' ? '' : ''; // 不持久化巨大 base64 到 GM（可选）
                            settings.jizuraFontName = fam;
                            settings.jizuraFont = 'custom';
                            // 存 dataURL 可能很大；仅会话内有效。若需持久可再议
                            window.__xmpJizuraFontData = reader.result;
                            saveSettings();
                            showToast('字体已加载（本次会话）');
                            renderSettingsUI();
                            if ((settings.lyricStyle || '') === 'jizura') {
                                try { if (window.XmpJizuraPlayer) window.XmpJizuraPlayer.invalidate(); } catch (e) {}
                                lyJizuraBoot(true);
                            }
                        }).catch((e) => showToast('字体加载失败'));
                    } catch (e) { showToast('无法读取字体'); }
                };
                reader.readAsDataURL(f);
            };
            inp.click();
        });
        const jzFontClear = body.querySelector('#xmp-jizura-font-clear');
        if (jzFontClear) jzFontClear.addEventListener('click', () => {
            settings.jizuraFontName = '';
            settings.jizuraFont = 'song';
            window.__xmpJizuraFontData = null;
            saveSettings();
            renderSettingsUI();
            showToast('已恢复宋体');
            if ((settings.lyricStyle || '') === 'jizura') lyJizuraBoot(true);
        });

                const uploadBtn = body.querySelector('#xmp-bg-upload-btn');
        if (uploadBtn) uploadBtn.addEventListener('click', () => {
            pickImage((dataUrl) => { settings.bgImage = dataUrl; saveSettings(); applySettings(); renderSettingsUI(); });
        });
        const clearBtn = body.querySelector('#xmp-bg-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            settings.bgImage = ''; saveSettings(); applySettings(); renderSettingsUI();
        });

        const accSel = body.querySelector('#xmp-sync-account-select');
        if (accSel) accSel.addEventListener('change', () => { activeSyncId = accSel.value; refreshActiveSyncConfig(); saveSyncConfig(); renderSettingsUI(); });
        const accRename = body.querySelector('#xmp-sync-rename');
        if (accRename) accRename.addEventListener('click', () => {
            const name = window.prompt('账号名称', syncConfig.name || '');
            if (name != null && name.trim()) { syncConfig.name = name.trim(); saveSyncConfig(); renderSettingsUI(); }
        });
        const accNew = body.querySelector('#xmp-sync-new');
        if (accNew) accNew.addEventListener('click', () => {
            const name = window.prompt('新账号名称', '账号 ' + (syncConfigs.length + 1));
            if (name == null || !name.trim()) return;
            const newCfg = { id: uid('sync'), name: name.trim(), enabled: true, url: '', user: '', pass: '', autoSync: false, lastSyncAt: 0, lastSyncStatus: '' };
            syncConfigs.push(newCfg); activeSyncId = newCfg.id; refreshActiveSyncConfig(); saveSyncConfig();
            renderSettingsUI();
            showToast('已新建账号');
        });
        const accDel = body.querySelector('#xmp-sync-del');
        if (accDel) accDel.addEventListener('click', () => {
            if (syncConfigs.length <= 1) { showToast('至少保留一个账号'); return; }
            if (!window.confirm(`确定删除账号「${syncConfig.name}」？`)) return;
            syncConfigs = syncConfigs.filter(c => c.id !== activeSyncId);
            activeSyncId = syncConfigs[0].id;
            refreshActiveSyncConfig(); saveSyncConfig(); renderSettingsUI();
        });

        const syncEnabledEl = body.querySelector('#xmp-sync-enabled');
        const syncAutoEl = body.querySelector('#xmp-sync-auto');
        const syncUrlEl = body.querySelector('#xmp-sync-url');
        const syncUserEl = body.querySelector('#xmp-sync-user');
        const syncPassEl = body.querySelector('#xmp-sync-pass');
        const readSyncForm = () => ({
            enabled: !!(syncEnabledEl && syncEnabledEl.checked),
            autoSync: !!(syncAutoEl && syncAutoEl.checked),
            url: syncUrlEl ? syncUrlEl.value.trim() : '',
            user: syncUserEl ? syncUserEl.value.trim() : '',
            pass: syncPassEl ? syncPassEl.value : ''
        });
        const bindChange = (el) => { if (!el) return; el.addEventListener('change', () => { Object.assign(syncConfig, readSyncForm()); saveSyncConfig(); }); };
        [syncEnabledEl, syncAutoEl].forEach(bindChange);
        [syncUrlEl, syncUserEl, syncPassEl].forEach(el => {
            if (!el) return;
            el.addEventListener('blur', () => { Object.assign(syncConfig, readSyncForm()); saveSyncConfig(); });
        });

        const syncSaveBtn = body.querySelector('#xmp-sync-save');
        if (syncSaveBtn) syncSaveBtn.addEventListener('click', () => {
            Object.assign(syncConfig, readSyncForm()); saveSyncConfig();
            showToast('云同步配置已保存'); renderSettingsUI();
        });
        const syncNowBtn = body.querySelector('#xmp-sync-now');
        if (syncNowBtn) syncNowBtn.addEventListener('click', async () => {
            Object.assign(syncConfig, readSyncForm()); saveSyncConfig();
            await syncNow(false);
        });
        const syncUpBtn = body.querySelector('#xmp-sync-upload');
        if (syncUpBtn) syncUpBtn.addEventListener('click', async () => {
            Object.assign(syncConfig, readSyncForm()); saveSyncConfig();
            await syncForceUpload();
        });
        const syncDownBtn = body.querySelector('#xmp-sync-download');
        if (syncDownBtn) syncDownBtn.addEventListener('click', async () => {
            Object.assign(syncConfig, readSyncForm()); saveSyncConfig();
            await syncForceDownload();
        });

        const exportBtn = body.querySelector('#xmp-export-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportData);

        const importBtn = body.querySelector('#xmp-import-btn');
        const importFile = body.querySelector('#xmp-import-file');
        if (importBtn && importFile) {
            importBtn.addEventListener('click', () => importFile.click());
            importFile.addEventListener('change', async () => {
                const file = importFile.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const mode = await showImportChoice();
                    if (!mode) return;
                    await importData(data, mode);
                } catch (e) { console.error(e); showToast('导入失败：' + e.message); }
                importFile.value = '';
            });
        }

        const resetStatsBtn = body.querySelector('#xmp-reset-stats-btn');
        if (resetStatsBtn) resetStatsBtn.addEventListener('click', () => {
            if (!window.confirm('确定清空所有听歌统计吗？\n清空后需要重新点「上传到云端」覆盖云端旧数据')) return;
            stats = { tracks: {}, days: {} };
            statsBaseline = { tracks: {}, days: {} };
            hourly = { days: {} };
            hourlyBaseline = { days: {} };
            saveStats(); saveStatsBaseline(); saveHourly(); saveHourlyBaseline();
            renderSettingsUI();
            if (currentPlaylistId === STATS_PLAYLIST_ID) { renderStatsPlaylistHead(); renderStatsPlaylist(); }
            showToast('统计已清空');
        });

        const clearAllBtn = body.querySelector('#xmp-clear-all-btn');
        if (clearAllBtn) clearAllBtn.addEventListener('click', async () => {
            const mode = await showClearAllDialog();
            if (!mode) return;
            await clearAllData(mode === 'both');
        });
    }

    /* ========== 导入/导出/清空 ========== */
    function utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    }
    function sanitizeForExport(list) {
        return list.map(pl => ({
            ...pl,
            tracks: pl.tracks.map(t => {
                if (t.type === 'local') { const { fileUrl, file, ...rest } = t; return { ...rest, fileUrl: '', file: undefined }; }
                return t;
            })
        }));
    }

    function exportData() {
        try {
            const data = {
                app: 'xny_music_player', version: 3,
                exportedAt: new Date().toISOString(),
                playlists: sanitizeForExport(playlists),
                settings: settings,
                stats: stats,
                hourly: hourly,
                state: { currentPlaylistId: currentPlaylistId === STATS_PLAYLIST_ID ? null : currentPlaylistId, currentTrackIndex, loopMode }
            };
            const json = JSON.stringify(data, null, 2);
            const b64 = utf8ToBase64(json);
            const now = new Date();
            const fname = `xny_music_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
            if (window.GM && window.GM.saveFile) {
                showToast('正在导出…');
                window.GM.saveFile(fname, b64);
            } else {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fname; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showToast('已导出：' + fname);
            }
        } catch (e) { console.error(e); showToast('导出失败：' + e.message); }
    }

    window.__onFileSaved = function (success, path) {
        if (success) showToast('已导出：' + path);
        else showToast('导出失败，请检查存储权限');
    };

    function showImportChoice() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'xmp-modal-mask';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
              <div style="background:#1a1a1a;color:#fff;padding:24px;border-radius:16px;max-width:320px;width:82%;font-family:-apple-system,system-ui,sans-serif;">
                <div style="font-size:16px;font-weight:600;margin-bottom:12px;">选择导入方式</div>
                <div style="font-size:13px;color:#8c8c8c;margin-bottom:20px;line-height:1.6;"><b style="color:#fff;">合并</b>：保留现有数据<br><b style="color:#fff;">覆盖</b>：清空现有数据</div>
                <div style="display:flex;gap:8px;">
                  <button id="imp-merge" style="flex:1;padding:10px;border:none;border-radius:10px;background:#333;color:#fff;font-size:14px;cursor:pointer;">合并</button>
                  <button id="imp-replace" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f87171;color:#fff;font-size:14px;cursor:pointer;">覆盖</button>
                  <button id="imp-cancel" style="padding:10px 14px;border:none;border-radius:10px;background:transparent;color:#8c8c8c;font-size:14px;cursor:pointer;">取消</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#imp-merge').onclick = () => { overlay.remove(); resolve('merge'); };
            overlay.querySelector('#imp-replace').onclick = () => { overlay.remove(); resolve('replace'); };
            overlay.querySelector('#imp-cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }

    async function importData(data, mode) {
        if (!data || typeof data !== 'object') throw new Error('文件格式无效');
        if (mode === 'replace') {
            if (Array.isArray(data.playlists) && data.playlists.length) playlists = data.playlists;
            if (data.settings && typeof data.settings === 'object') settings = { ...DEFAULT_SETTINGS, ...data.settings };
            if (data.stats && typeof data.stats === 'object') stats = { tracks: data.stats.tracks || {}, days: data.stats.days || {} };
            if (data.hourly && typeof data.hourly === 'object') hourly = { days: data.hourly.days || {} };
            if (data.state) {
                if (typeof data.state.currentPlaylistId === 'string') currentPlaylistId = data.state.currentPlaylistId;
                if (typeof data.state.currentTrackIndex === 'number') currentTrackIndex = data.state.currentTrackIndex;
                if (data.state.loopMode) loopMode = data.state.loopMode;
            }
        } else {
            if (Array.isArray(data.playlists)) playlists = mergePlaylists(playlists, data.playlists);
            if (data.stats) stats = applyStatsDelta(stats, { tracks: data.stats.tracks || {}, days: data.stats.days || {} });
            if (data.hourly && data.hourly.days) hourly = applyHourlyDelta(hourly, { days: data.hourly.days });
        }
        for (const dk in hourly.days) {
            const arr = hourly.days[dk];
            if (!Array.isArray(arr) || arr.length !== 24) {
                const fixed = new Array(24).fill(0);
                if (Array.isArray(arr)) for (let i = 0; i < Math.min(24, arr.length); i++) fixed[i] = Number(arr[i]) || 0;
                hourly.days[dk] = fixed;
            }
        }
        if (!Array.isArray(playlists) || !playlists.length) playlists = [{ id: uid('pl'), name: '默认歌单', cover: '', tracks: [], createdAt: Date.now() }];
        for (const pl of playlists) {
            pl.id = pl.id || uid('pl'); pl.name = pl.name || '未命名歌单'; pl.cover = pl.cover || '';
            if (!Array.isArray(pl.tracks)) pl.tracks = [];
            for (const t of pl.tracks) {
                t.id = t.id || uid('tk');
                if (typeof t.customTitle !== 'string') t.customTitle = '';
                if (typeof t.source !== 'string') t.source = '';
            }
        }
        if (currentPlaylistId !== STATS_PLAYLIST_ID && !playlists.find(p => p.id === currentPlaylistId)) {
            currentPlaylistId = playlists[0].id; currentTrackIndex = -1;
        }
        statsBaseline = cloneStats(stats); saveStatsBaseline();
        hourlyBaseline = cloneHourly(hourly); saveHourlyBaseline();
        savePlaylists(); saveSettings(); saveStats(); saveHourly(); saveState();
        applySettings();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist(); renderSettingsUI(); updateLoopModeUI();
        showToast('导入完成');
        logStep('DATA', `导入完成（${mode === 'merge' ? '合并' : '覆盖'}）`);
        scheduleAutoSync();
    }

    function showClearAllDialog() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'xmp-modal-mask';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
            const hasSync = syncConfig.enabled && syncConfig.url && syncConfig.user && syncConfig.pass;
            overlay.innerHTML = `
              <div style="background:#1a1a1a;color:#fff;padding:24px;border-radius:16px;max-width:340px;width:86%;font-family:-apple-system,system-ui,sans-serif;">
                <div style="font-size:16px;font-weight:600;margin-bottom:12px;">⚠️ 清空全部数据</div>
                <div style="font-size:13px;color:#8c8c8c;margin-bottom:14px;line-height:1.7;">将清空：<br>• 所有歌单及歌曲<br>• 全部听歌统计与排行<br>• 所有设置项<br>• 悬浮球位置</div>
                <div style="font-size:12px;color:#f87171;margin-bottom:18px;">⚠️ 操作不可恢复，云同步账号配置会保留</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${hasSync ? `<button id="clear-both" style="padding:12px;border:none;border-radius:10px;background:#f87171;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">清空本地 + 云端</button>` : ''}
                  <button id="clear-local" style="padding:12px;border:none;border-radius:10px;background:#333;color:#fff;font-size:14px;cursor:pointer;">仅清空本地</button>
                  <button id="clear-cancel" style="padding:12px;border:none;border-radius:10px;background:transparent;color:#8c8c8c;font-size:14px;cursor:pointer;">取消</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
            const both = overlay.querySelector('#clear-both');
            if (both) both.onclick = () => { overlay.remove(); resolve('both'); };
            overlay.querySelector('#clear-local').onclick = () => { overlay.remove(); resolve('local'); };
            overlay.querySelector('#clear-cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }

    async function clearAllData(includeCloud) {
        if (audio) { try { audio.pause(); audio.src = ''; } catch (e) { } }
        currentTrack = null; currentTrackIndex = -1;
        endListenSession();
        playlists = [{ id: uid('pl'), name: '默认歌单', cover: '', tracks: [], createdAt: Date.now(), updatedAt: Date.now(), showOnWall: true }];
        currentPlaylistId = playlists[0].id;
        stats = { tracks: {}, days: {} }; statsBaseline = { tracks: {}, days: {} };
        hourly = { days: {} }; hourlyBaseline = { days: {} };
        settings = { ...DEFAULT_SETTINGS };
        loopMode = 'list';
        savePlaylists(); saveStats(); saveStatsBaseline(); saveHourly(); saveHourlyBaseline(); saveSettings(); saveState();
        if (includeCloud) {
            try {
                showToast('正在清空云端…');
                await cloudPushFile(SYNC_FILE_PLAYLISTS, buildPlaylistsPayload());
                await cloudPushFile(SYNC_FILE_STATS, buildStatsPayload());
                await cloudPushFile(SYNC_FILE_HOURLY, buildHourlyPayload());
                logStep('SYNC', '云端数据已重置为空');
            } catch (e) { logStep('ERR', '云端清空失败：' + e.message); showToast('云端清空失败：' + e.message); }
        }
        applySettings();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist(); renderSettingsUI(); updateLoopModeUI();
        updateNowPlayingUI(); updateFabIcon(); notifyNativePlayState();
        if (fab) {
            const next = clampPos(window.innerWidth - settings.collapsedSize - 16, 20);
            fab.style.left = next.left + 'px'; fab.style.top = next.top + 'px';
            savePos(next.left, next.top);
        }
        showToast(includeCloud ? '已清空本地与云端数据' : '已清空本地数据');
    }

    /* ========== 面板展开/收起 ========== */
    function expandPanel() {
        if (EMBED_MODE) return;
        if (!panel || isExpanded) return;
        isExpanded = true;
        panel.classList.add('open');
        requestAnimationFrame(() => positionPanel());
        updateNowPlayingUI();
        renderPlaylistTabs(); renderPlaylistHead(); renderPlaylist();
        updatePlayButton(); updateLoopModeUI(); updateVinylSpin(isPlaying);
    }
    function collapsePanel() {
        if (EMBED_MODE) return;
        if (!panel || !isExpanded) return;
        isExpanded = false;
        panel.classList.remove('open');
        const vinyl = panel.querySelector('#xmp-vinyl');
        if (vinyl) vinyl.classList.remove('spinning');
        switchView('player');
    }

    /* ========== 悬浮球操作（原生广播） ========== */
    window.__onFloatingAction = function (action) {
        switch (action) {
            case 'play_pause': togglePlay(); break;
            case 'prev': playPrev(); break;
            case 'next': playNext(); break;
            case 'loop':
                loopMode = loopMode === 'list' ? 'single' : loopMode === 'single' ? 'shuffle' : 'list';
                saveState();
                if (panel) updateLoopModeUI();
                notifyNativePlayState();
                showToast(`循环: ${loopMode === 'list' ? '列表' : loopMode === 'single' ? '单曲' : '随机'}`);
                break;
        }
    };

    /* ========== 媒体按钮（MediaSession 桥接） ========== */
    window.__onMediaAction = function (action) {
        logStep('MEDIA', `媒体按钮：${action}`);
        switch (action) {
            case 'play_pause': togglePlay(); break;
            case 'play': if (!isPlaying) togglePlay(); break;
            case 'pause': if (isPlaying) togglePlay(); break;
            case 'next': playNext(); break;
            case 'prev': playPrev(); break;
        }
    };

    document.addEventListener('visibilitychange', () => { if (document.hidden) { saveStats(); saveHourly(); } });
    window.addEventListener('beforeunload', () => { endListenSession(); });

    function waitBody(cb) {
        if (document.body) { cb(); return; }
        const t = setInterval(() => { if (document.body) { clearInterval(t); cb(); } }, 100);
    }

    waitBody(async () => {
        await loadSettings();
    try { if (settings.lyricStyle === 'folia' || settings.lyricStyle === 'jizura') settings.lyricStyle = 'scroll'; } catch (_) {}
        await loadPlaylists();
        await loadState();
        await loadStats();
        await loadStatsBaseline();
        await loadHourly();
        await loadHourlyBaseline();
        await loadSyncConfig();
        initAudio();
        createPanel();
        try { bindNcmLibrarySearch(); } catch (e) { console.warn(e); }
        try { bindAmPlayerInteractions(); } catch (e) { console.warn(e); }
        try { bindCloudSearchPage(); } catch (e) { console.warn(e); }
        try {
          const sb = document.querySelector('#xmp-settings-back');
          if (sb && !sb.dataset.bound) {
            sb.dataset.bound = '1';
            sb.addEventListener('click', () => switchAppView('home'));
          }
        } catch (e) {}


        if (EMBED_MODE) {
            isExpanded = true;
            panel.classList.add('embed', 'open');
            panel.style.pointerEvents = 'auto';
        } else {
            await createFab();
        }

        applySettings();

        const pl = getCurrentPlaylist();
        if (pl && currentTrackIndex >= 0 && currentTrackIndex < pl.tracks.length) {
            currentTrack = pl.tracks[currentTrackIndex];
            updateNowPlayingUI(); updateFabIcon();
        }

        notifyNativePlayState();

        if (!EMBED_MODE) {
            document.addEventListener('click', (e) => {
                if (!isExpanded) return;
                if (panel && panel.contains(e.target)) return;
                if (fab && fab.contains(e.target)) return;
                if (e.target && e.target.closest && e.target.closest('.xmp-modal-mask')) return;
                collapsePanel();
            }, true);
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isExpanded) collapsePanel(); });
        }

        if (syncConfig.enabled && syncConfig.autoSync) {
            setTimeout(() => syncNow(true), 1500);
        }
    });

})();