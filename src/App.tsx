import { useEffect, useMemo, useRef, useState } from 'react';
import {
  drawMultipleCards,
  drawNextCard,
  filterCardsByCategories,
  getOrientationLabel,
  type CardFilter,
} from './lib/tarot';
import type { DrawnCard, TarotCard, TarotDeck } from './types/tarot';

type ViewMode = 'draw' | 'gallery';
type DrawAnimationStage = 'idle' | 'shuffling' | 'cutting' | 'spreading' | 'revealing';
type AccessStatus = 'checking' | 'locked' | 'granted';
type AccessLogRecord = {
  id: string;
  event: string;
  detail: string;
  createdAt: string;
  deviceId: string | null;
};

const accessStorageKey = 'lucinda_tarot_access_key';
const deviceStorageKey = 'lucinda_tarot_device_id';

const filterOptions: Array<{ value: CardFilter; label: string }> = [
  { value: 'major', label: '大阿尔卡那' },
  { value: 'minor-all', label: '小阿尔卡那牌' },
  { value: 'minor-ace', label: '小阿尔卡那 Ace 牌' },
  { value: 'minor-court', label: '小阿尔卡那宫廷牌' },
  { value: 'blank', label: '空白牌' },
];

const ritualSteps = [
  {
    title: '1. 选择牌组与范围',
    description: '先确定使用哪一套牌，再限制本次抽牌范围，页面会自动清空上一次记录。',
  },
  {
    title: '2. 开始抽牌',
    description: '点击抽一张牌或直接展开整组牌阵，系统会自动给出正位或逆位。',
  },
  {
    title: '3. 查看解读',
    description: '每张牌都会显示基本信息与当前方向对应的提示语，可直接作为占卜记录使用。',
  },
] as const;

const readingNotes = [
  '大阿尔卡那更适合看人生阶段、关系转折与长期主题。',
  '小阿尔卡那更适合看具体事件、情绪状态、执行动作与现实推进。',
  '宫廷牌通常对应人物角色、处事风格，或你当下需要采用的姿态。',
  '如果抽到空白牌，可把它视为未知、未定局或需要补充提问的信号。',
] as const;

function App() {
  const currentPath = window.location.pathname;

  if (currentPath === '/manage') {
    return <ShareAdminPage />;
  }

  return <ProtectedTarotPage />;
}

function ProtectedTarotPage() {
  const [status, setStatus] = useState<AccessStatus>('checking');
  const [statusMessage, setStatusMessage] = useState('正在校验访问链接...');
  const [accessKey, setAccessKey] = useState('');
  const [decks, setDecks] = useState<TarotDeck[]>([]);
  const [watermarkText, setWatermarkText] = useState('');
  const deviceId = getOrCreateDeviceId();

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const sharedToken = params.get('token');
      const storedAccessKey = window.sessionStorage.getItem(accessStorageKey);

      if (sharedToken) {
        const result = await consumeSharedToken(sharedToken, deviceId);

        if (result.ok) {
          window.sessionStorage.setItem(accessStorageKey, result.accessKey);
          window.history.replaceState({}, '', '/');
          setAccessKey(result.accessKey);
          setWatermarkText(result.watermarkText);
          return;
        }

        window.sessionStorage.removeItem(accessStorageKey);
        setStatus('locked');
        setStatusMessage(result.message);
        return;
      }

      if (storedAccessKey) {
        const result = await verifyAccessKey(storedAccessKey, deviceId);

        if (result.ok) {
          setAccessKey(storedAccessKey);
          setWatermarkText(result.watermarkText);
          return;
        }

        window.sessionStorage.removeItem(accessStorageKey);
      }

      setStatus('locked');
      setStatusMessage('这个页面需要通过 Lucinda 重新分享的一次性链接进入。');
    };

    void run();
  }, [deviceId]);

  useEffect(() => {
    if (!accessKey) {
      return;
    }

    let disposed = false;

    const loadDecks = async () => {
      const result = await fetchProtectedDecks(accessKey, deviceId);

      if (disposed) {
        return;
      }

      if (result.ok) {
        setDecks(result.decks);
        setWatermarkText(result.watermarkText);
        setStatus('granted');
        return;
      }

      window.sessionStorage.removeItem(accessStorageKey);
      setStatus('locked');
      setStatusMessage(result.message);
    };

    const verify = async () => {
      const result = await verifyAccessKey(accessKey, deviceId);

      if (disposed || result.ok) {
        if (result.ok) {
          setWatermarkText(result.watermarkText);
        }
        return;
      }

      window.sessionStorage.removeItem(accessStorageKey);
      setStatus('locked');
      setStatusMessage('当前访问许可已失效，牌面内容已锁定，需要重新分享新的链接。');
    };

    void loadDecks();

    const intervalId = window.setInterval(() => {
      void verify();
    }, 30000);

    const handleVisibilityChange = () => {
      void verify();
    };

    const handleWindowBlur = () => {
      void verify();
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        void verify();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [accessKey, deviceId]);

  if (status === 'checking') {
    return (
      <main className="access-shell">
        <section className="access-card">
          <p className="eyebrow">Lucinda Tarot Access</p>
          <h1>正在验证访问资格</h1>
          <p className="hero-text">{statusMessage}</p>
        </section>
      </main>
    );
  }

  if (status === 'locked') {
    return (
      <main className="access-shell">
        <section className="access-card">
          <p className="eyebrow">Lucinda Tarot Access</p>
          <h1>链接已失效或不可直接访问</h1>
          <p className="hero-text">{statusMessage}</p>
          <div className="guide-list">
            <p>1. 这个页面不能通过固定链接长期访问。</p>
            <p>2. 每个分享链接默认只能成功打开一次。</p>
            <p>3. 需要 Lucinda 重新生成并发送新的链接。</p>
          </div>
          <a className="secondary-link" href="/manage">
            打开管理页生成新链接
          </a>
        </section>
      </main>
    );
  }

  return <TarotPage decks={decks} watermarkText={watermarkText} />;
}

function ShareAdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [label, setLabel] = useState('微信分享');
  const [expiresInHours, setExpiresInHours] = useState('1');
  const [shareUrl, setShareUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('填写管理员口令后即可生成一次性分享链接。');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState<AccessLogRecord[]>([]);
  const shareUrlReachability = shareUrl ? getShareUrlReachability(shareUrl) : null;

  const handleGenerateLink = async () => {
    setIsSubmitting(true);
    setStatusMessage('正在生成分享链接...');

    try {
      const response = await fetch('/api/admin/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          label,
          expiresInHours: Number(expiresInHours),
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        shareUrl?: string;
      };

      if (!response.ok || !data.shareUrl) {
        setShareUrl('');
        setStatusMessage(data.message ?? '生成链接失败，请检查管理员口令。');
        return;
      }

      setShareUrl(data.shareUrl);
      setStatusMessage(
        getShareUrlReachability(data.shareUrl).message,
      );
    } catch (error) {
      setShareUrl('');
      setStatusMessage(
        error instanceof Error ? error.message : '生成链接失败，请稍后再试。',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    setStatusMessage('分享链接已复制，可以直接发到微信。');
  };

  const handleLoadLogs = async () => {
    try {
      const response = await fetch('/api/admin/logs', {
        headers: {
          'x-admin-key': adminKey,
        },
      });

      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        logs?: AccessLogRecord[];
      };

      if (!response.ok || !data.logs) {
        setStatusMessage(data.message ?? '读取访问日志失败。');
        return;
      }

      setLogs(data.logs);
      setStatusMessage('已读取最近访问日志。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '读取访问日志失败。');
    }
  };

  return (
    <main className="access-shell">
      <section className="access-card admin-card">
        <p className="eyebrow">Lucinda Share Manager</p>
        <h1>生成一次性微信分享链接</h1>
        <p className="hero-text">
          后端会为每次分享生成一个独立 token。对方第一次打开成功后，这个 token 就会失效。
        </p>

        <label className="field">
          <span>管理员口令</span>
          <input
            className="text-input"
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="输入 SHARE_ADMIN_KEY"
          />
        </label>

        <label className="field">
          <span>链接备注</span>
          <input
            className="text-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="例如：4 月份占卜分享"
          />
        </label>

        <label className="field">
          <span>有效时长（小时）</span>
          <input
            className="text-input"
            type="number"
            min="1"
            max="168"
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(event.target.value)}
          />
        </label>

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={handleGenerateLink}
            disabled={isSubmitting || !adminKey.trim()}
          >
            {isSubmitting ? '生成中...' : '生成新链接'}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleCopy}
            disabled={!shareUrl}
          >
            复制链接
          </button>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={handleLoadLogs}
          disabled={!adminKey.trim()}
        >
          查看最近日志
        </button>

        <div className="meaning-card">
          <span className="meaning-label">状态</span>
          <p>{statusMessage}</p>
        </div>

        <div className="share-output">
          <span className="meaning-label">当前生成链接</span>
          <code>{shareUrl || '尚未生成'}</code>
        </div>

        {shareUrlReachability ? (
          <div className="meaning-card">
            <span className="meaning-label">可访问性检查</span>
            <p>{shareUrlReachability.message}</p>
          </div>
        ) : null}

        {logs.length > 0 ? (
          <div className="share-output">
            <span className="meaning-label">最近访问日志</span>
            {logs.map((log) => (
              <p key={log.id}>
                {log.createdAt} | {log.event} | {log.deviceId ?? 'unknown'} | {log.detail}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function TarotPage({ decks, watermarkText }: { decks: TarotDeck[]; watermarkText: string }) {
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0]?.id ?? '');
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('draw');
  const [selectedFilters, setSelectedFilters] = useState<CardFilter[]>(['major', 'minor-all']);
  const [failedCardImages, setFailedCardImages] = useState<string[]>([]);
  const [failedBackImages, setFailedBackImages] = useState<string[]>([]);
  const [previewCard, setPreviewCard] = useState<DrawnCard | null>(null);
  const [isFlipRevealed, setIsFlipRevealed] = useState(false);
  const [isAnimatingDraw, setIsAnimatingDraw] = useState(false);
  const [drawAnimationStage, setDrawAnimationStage] = useState<DrawAnimationStage>('idle');
  const [showCompletedSpread, setShowCompletedSpread] = useState(false);
  const animationTimersRef = useRef<number[]>([]);
  const drawnCardsRef = useRef<DrawnCard[]>([]);

  useEffect(() => {
    if (decks.length === 0) {
      return;
    }

    setSelectedDeckId((current) =>
      decks.some((deck) => deck.id === current) ? current : decks[0].id,
    );
  }, [decks]);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? decks[0],
    [decks, selectedDeckId],
  );

  if (!selectedDeck) {
    return (
      <main className="access-shell">
        <section className="access-card">
          <p className="eyebrow">Lucinda Tarot Access</p>
          <h1>正在加载受保护的牌面内容</h1>
          <p className="hero-text">牌组数据需要通过实时校验后才能展示。</p>
        </section>
      </main>
    );
  }
  const filteredDeckCards = useMemo(
    () => filterCardsByCategories(selectedDeck.cards, selectedFilters),
    [selectedDeck.cards, selectedFilters],
  );
  const drawDeck = useMemo(
    () => ({
      ...selectedDeck,
      cards: filteredDeckCards,
    }),
    [filteredDeckCards, selectedDeck],
  );
  const remainingCount = filteredDeckCards.length - drawnCards.length;
  const latestCard = drawnCards[drawnCards.length - 1] ?? null;
  const displayCard = previewCard ?? latestCard;
  const remainingCards = useMemo(() => {
    const drawnIds = new Set(drawnCards.map((item) => item.card.id));
    return filteredDeckCards.filter((card) => !drawnIds.has(card.id));
  }, [drawnCards, filteredDeckCards]);
  const largeSpreadCount = Math.min(78, filteredDeckCards.length);
  const canRunLargeSpread = !isAnimatingDraw && remainingCount >= largeSpreadCount && largeSpreadCount > 0;

  useEffect(() => {
    drawnCardsRef.current = drawnCards;
  }, [drawnCards]);

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const clearAnimationTimers = () => {
    animationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    animationTimersRef.current = [];
  };

  const resetDrawSession = () => {
    clearAnimationTimers();
    setDrawnCards([]);
    setPreviewCard(null);
    setIsFlipRevealed(false);
    setIsAnimatingDraw(false);
    setDrawAnimationStage('idle');
    setShowCompletedSpread(false);
  };

  const handleDrawCard = () => {
    if (isAnimatingDraw) {
      return;
    }

    const nextCard = drawNextCard(drawDeck, drawnCardsRef.current);

    if (!nextCard) {
      return;
    }

    setPreviewCard(nextCard);
    setIsAnimatingDraw(true);
    setIsFlipRevealed(false);
    setDrawAnimationStage('shuffling');

    const cuttingTimer = window.setTimeout(() => {
      setDrawAnimationStage('cutting');
    }, 520);

    const spreadingTimer = window.setTimeout(() => {
      setDrawAnimationStage('spreading');
    }, 1120);

    const revealingStageTimer = window.setTimeout(() => {
      setDrawAnimationStage('revealing');
    }, 1640);

    const revealTimer = window.setTimeout(() => {
      setIsFlipRevealed(true);
    }, 1780);

    const commitTimer = window.setTimeout(() => {
      setDrawnCards((latest) => {
        const exists = latest.some(
          (item) => item.card.id === nextCard.card.id && item.order === nextCard.order,
        );
        return exists ? latest : [...latest, nextCard];
      });
      setIsAnimatingDraw(false);
      setDrawAnimationStage('idle');
      animationTimersRef.current = [];
    }, 2660);

    animationTimersRef.current.push(
      cuttingTimer,
      spreadingTimer,
      revealingStageTimer,
      revealTimer,
      commitTimer,
    );
  };

  const handleLargeSpread = () => {
    if (isAnimatingDraw || largeSpreadCount === 0) {
      return;
    }

    const batchCards = drawMultipleCards(drawDeck, drawnCardsRef.current, largeSpreadCount);

    if (batchCards.length === 0) {
      return;
    }

    const previewLastCard = batchCards[batchCards.length - 1];
    setPreviewCard(previewLastCard);
    setIsAnimatingDraw(true);
    setIsFlipRevealed(false);
    setDrawAnimationStage('shuffling');

    const cuttingTimer = window.setTimeout(() => {
      setDrawAnimationStage('cutting');
    }, 620);

    const spreadingTimer = window.setTimeout(() => {
      setDrawAnimationStage('spreading');
    }, 1260);

    const revealingStageTimer = window.setTimeout(() => {
      setDrawAnimationStage('revealing');
    }, 1960);

    const revealTimer = window.setTimeout(() => {
      setIsFlipRevealed(true);
    }, 2120);

    const commitTimer = window.setTimeout(() => {
      setDrawnCards((latest) => {
        const existingIds = new Set(latest.map((item) => item.card.id));
        const freshCards = batchCards.filter((item) => !existingIds.has(item.card.id));
        return [...latest, ...freshCards];
      });
      setIsAnimatingDraw(false);
      setDrawAnimationStage('idle');
      setShowCompletedSpread(false);
      animationTimersRef.current = [];
    }, 3040);

    animationTimersRef.current.push(
      cuttingTimer,
      spreadingTimer,
      revealingStageTimer,
      revealTimer,
      commitTimer,
    );
  };

  const handleReset = () => {
    resetDrawSession();
  };

  const handleDeckChange = (deckId: string) => {
    setSelectedDeckId(deckId);
    setFailedCardImages([]);
    setFailedBackImages([]);
    resetDrawSession();
  };

  const handleFilterChange = (filter: CardFilter) => {
    setSelectedFilters((current) => {
      if (current.includes(filter)) {
        const next = current.filter((item) => item !== filter);
        return next.length > 0 ? next : current;
      }

      if (current.length >= 3) {
        return [...current.slice(1), filter];
      }

      return [...current, filter];
    });
    resetDrawSession();
  };

  const configuredImageCount = selectedDeck.cards.filter((card) => Boolean(card.image)).length;
  const latestCardImageReady =
    displayCard && displayCard.card.image && !failedCardImages.includes(displayCard.card.id);
  const deckBackReady =
    selectedDeck.backImage && !failedBackImages.includes(selectedDeck.id);
  const selectedFilterLabels = filterOptions
    .filter((option) => selectedFilters.includes(option.value))
    .map((option) => option.label)
    .join(' / ');
  const currentMeaning = displayCard
    ? displayCard.orientation === 'upright'
      ? displayCard.card.meaningUp
      : displayCard.card.meaningReversed
    : '';

  const markCardImageFailed = (cardId: string) => {
    setFailedCardImages((current) => (current.includes(cardId) ? current : [...current, cardId]));
  };

  const markBackImageFailed = (deckId: string) => {
    setFailedBackImages((current) => (current.includes(deckId) ? current : [...current, deckId]));
  };

  return (
    <main className="app-shell">
      {watermarkText ? <div className="watermark-layer">{watermarkText}</div> : null}
      <section className="hero-card">
        <div className="hero-ornaments" aria-hidden="true">
          <div className="crystal-ball">
            <div className="crystal-core" />
          </div>
          <div className="candle candle-left">
            <span className="flame" />
          </div>
          <div className="candle candle-right">
            <span className="flame" />
          </div>
          <div className="star star-a" />
          <div className="star star-b" />
          <div className="star star-c" />
        </div>
        <p className="eyebrow">Lucinda Tarot</p>
        <h1>Lucinda 的移动塔罗牌</h1>
        <p className="hero-text">
          这是 Lucinda 的移动塔罗牌页面。你可以在同一页完成牌组选择、抽牌、结果查看和基础说明阅读。
        </p>
        <div className="view-switch">
          <button
            className={viewMode === 'draw' ? 'view-tab active' : 'view-tab'}
            onClick={() => setViewMode('draw')}
          >
            移动抽牌
          </button>
          <button
            className={viewMode === 'gallery' ? 'view-tab active' : 'view-tab'}
            onClick={() => setViewMode('gallery')}
          >
            牌面图鉴
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>使用流程</h2>
          <span className="status-text">Lucinda 专用</span>
        </div>
        <div className="doc-grid">
          {ritualSteps.map((step) => (
            <article key={step.title} className="doc-card">
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>牌组设置</h2>
          <span className="status-text">剩余 {remainingCount} 张</span>
        </div>

        <label className="field">
          <span>当前牌组</span>
          <select
            value={selectedDeckId}
            onChange={(event) => handleDeckChange(event.target.value)}
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>抽牌范围</span>
          <div className="filter-chip-group">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={selectedFilters.includes(option.value) ? 'filter-chip active' : 'filter-chip'}
                onClick={() => handleFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="field-hint">可同时选 1 到 3 项，当前：{selectedFilterLabels}</p>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span>当前范围</span>
            <strong>{filteredDeckCards.length} 张</strong>
          </article>
          <article className="stat-card">
            <span>已抽牌数</span>
            <strong>{drawnCards.length}</strong>
          </article>
          <article className="stat-card">
            <span>是否重复</span>
            <strong>不重复</strong>
          </article>
          <article className="stat-card">
            <span>已配图路径</span>
            <strong>{configuredImageCount} 张</strong>
          </article>
        </div>

        {deckBackReady ? (
          <div className="deck-preview">
            <img
              className="deck-back-image"
              src={selectedDeck.backImage}
              alt={`${selectedDeck.name}牌背`}
              onError={() => markBackImageFailed(selectedDeck.id)}
            />
            <div className="deck-preview-copy">
              <strong>{selectedDeck.name}</strong>
              <p>牌背路径已接入。把对应图片放进资源目录后，这里会直接显示真实牌背。</p>
            </div>
          </div>
        ) : (
          <div className="deck-preview">
            <div className="deck-back-image placeholder-cardback">
              <span>牌背预览</span>
            </div>
            <div className="deck-preview-copy">
              <strong>{selectedDeck.name}</strong>
              <p>当前牌背图片未加载成功。请把 `back.jpg` 放入对应牌组目录。</p>
            </div>
          </div>
        )}
      </section>

      {viewMode === 'draw' ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>抽牌操作</h2>
              <span className="status-text">大桌牌阵 {largeSpreadCount} 张</span>
            </div>
            <div className="action-row">
              <button
                className="primary-button"
                onClick={handleDrawCard}
                disabled={remainingCount === 0 || isAnimatingDraw}
              >
                {isAnimatingDraw
                  ? '翻牌中...'
                  : remainingCount === 0
                    ? '已抽完当前范围'
                    : '抽一张牌'}
              </button>
              <button className="secondary-button" onClick={handleReset}>
                重新开始
              </button>
            </div>
            {drawnCards.length > 0 && drawnCards.length < largeSpreadCount ? (
              <button
                className="completion-button"
                onClick={() => setShowCompletedSpread((current) => !current)}
              >
                {showCompletedSpread ? '收起横向铺牌' : '完毕铺牌'}
              </button>
            ) : null}
            <button
              className="ritual-button"
              onClick={handleLargeSpread}
              disabled={!canRunLargeSpread}
            >
              {isAnimatingDraw
                ? '牌阵展开中...'
                : canRunLargeSpread
                  ? `开始 ${largeSpreadCount} 张大桌牌阵`
                  : `当前范围不足 ${largeSpreadCount} 张或已抽过`}
            </button>
          </section>

          <section className="panel featured-result">
            <div className="panel-head">
              <h2>当前结果</h2>
              {displayCard ? (
                <span className="status-text">第 {displayCard.order} 张</span>
              ) : (
                <span className="status-text">等待抽牌</span>
              )}
            </div>

            {displayCard ? (
              <article className="result-card">
                <div className="result-glow" aria-hidden="true" />
                <div className={`draw-stage draw-stage-${drawAnimationStage}`}>
                  <div className="draw-stage-arena">
                    <div className="shuffle-stack primary-stack" />
                    <div className="shuffle-stack secondary-stack" />
                    <div className="shuffle-stack tertiary-stack" />
                    <div className="cut-pile pile-left" />
                    <div className="cut-pile pile-center" />
                    <div className="cut-pile pile-right" />
                    <div className="spread-card spread-left" />
                    <div className="spread-card spread-center" />
                    <div className="spread-card spread-right" />
                  </div>
                  <p className="draw-stage-text">
                    {drawAnimationStage === 'shuffling' && '正在洗牌'}
                    {drawAnimationStage === 'cutting' && '正在切牌，分成三组'}
                    {drawAnimationStage === 'spreading' && '正在摊牌'}
                    {drawAnimationStage === 'revealing' && '正在翻开结果'}
                    {drawAnimationStage === 'idle' && '已完成本次抽牌'}
                  </p>
                </div>
                <div className={`result-layout ${isAnimatingDraw ? 'is-animating' : ''}`}>
                  <div className="visual-card">
                    <div className={`flip-card ${isFlipRevealed ? 'is-revealed' : ''}`}>
                      <div className="flip-card-face flip-card-back">
                        {deckBackReady ? (
                          <img
                            className="tarot-image"
                            src={selectedDeck.backImage}
                            alt={`${selectedDeck.name}牌背`}
                            onError={() => markBackImageFailed(selectedDeck.id)}
                          />
                        ) : (
                          <div className="tarot-image placeholder">
                            <span>牌背</span>
                          </div>
                        )}
                      </div>
                      <div className="flip-card-face flip-card-front">
                        {latestCardImageReady ? (
                          <img
                            className={`tarot-image ${displayCard.orientation === 'reversed' ? 'is-reversed' : ''}`}
                            src={displayCard.card.image}
                            alt={displayCard.card.name}
                            onError={() => markCardImageFailed(displayCard.card.id)}
                          />
                        ) : (
                          <div className="tarot-image placeholder">
                            <span>{displayCard.card.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="result-content">
                    <div className="result-badges">
                      <div className="card-badge">{getOrientationLabel(displayCard.orientation)}</div>
                      <div className="card-badge subtle-badge">{getArcanaLabel(displayCard.card)}</div>
                    </div>
                    <h3>{displayCard.card.name}</h3>
                    <p>抽牌次序：第 {displayCard.order} 张</p>
                    <p>抽牌时秒数：{displayCard.second} 秒</p>
                    <p>抽牌时间：{displayCard.drawnAt}</p>
                    <div className="meaning-card">
                      <span className="meaning-label">当前提示</span>
                      <p>{currentMeaning}</p>
                    </div>
                  </div>
                </div>
              </article>
            ) : (
              <article className="empty-state">
                <p>还没有抽牌。点击上方按钮开始本次占卜。</p>
              </article>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>抽牌记录</h2>
              <span className="status-text">{drawnCards.length} 条</span>
            </div>

            {drawnCards.length > 0 ? (
              <div className="history-list">
                {drawnCards.map((item) => (
                  <article key={`${item.card.id}-${item.order}`} className="history-item">
                    <div>
                      <strong>{item.card.name}</strong>
                      <p>{getOrientationLabel(item.orientation)}</p>
                    </div>
                    <span>第 {item.order} 张</span>
                  </article>
                ))}
              </div>
            ) : (
              <article className="empty-state compact">
                <p>抽牌记录会在这里按顺序展示。</p>
              </article>
            )}
          </section>

          {drawnCards.length >= largeSpreadCount && largeSpreadCount > 0 ? (
            <section className="panel">
              <div className="panel-head">
                <h2>大桌牌阵</h2>
                <span className="status-text">{largeSpreadCount} 张网格摊开</span>
              </div>
              <div className="large-spread-grid">
                {drawnCards.slice(0, largeSpreadCount).map((item, index) => (
                  <article
                    key={`spread-${item.card.id}`}
                    className="spread-result-card"
                    style={
                      {
                        '--spread-rotate': `${getSpreadRotation(index)}deg`,
                        '--spread-offset': `${getSpreadOffset(index)}px`,
                      } as React.CSSProperties
                    }
                  >
                    {renderCardVisual(item.card, item.orientation)}
                    <div className="spread-result-meta">
                      <strong>{item.card.name}</strong>
                      <p>{getOrientationLabel(item.orientation)}</p>
                      <p>第 {item.order} 张</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {showCompletedSpread && drawnCards.length > 0 && drawnCards.length < largeSpreadCount ? (
            <section className="panel">
              <div className="panel-head">
                <h2>横向铺牌</h2>
                <span className="status-text">{drawnCards.length} 张</span>
              </div>
              <div className="completed-spread-row">
                {drawnCards.map((item, index) => (
                  <article
                    key={`completed-${item.card.id}-${item.order}`}
                    className="completed-spread-card"
                    style={
                      {
                        '--spread-rotate': `${getCompletedRotation(index)}deg`,
                        '--spread-offset': `${getCompletedOffset(index)}px`,
                      } as React.CSSProperties
                    }
                  >
                    {renderCardVisual(item.card, item.orientation)}
                    <div className="spread-result-meta">
                      <strong>{item.card.name}</strong>
                      <p>{getOrientationLabel(item.orientation)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {remainingCards.length > 0 && drawnCards.length >= largeSpreadCount ? (
            <section className="panel">
              <div className="panel-head">
                <h2>剩余未抽牌</h2>
                <span className="status-text">{remainingCards.length} 张</span>
              </div>
              <div className="remaining-cards-grid">
                {remainingCards.map((card) => (
                  <article key={`remaining-${card.id}`} className="remaining-card">
                    {renderCardVisual(card)}
                    <div className="spread-result-meta">
                      <strong>{card.name}</strong>
                      <p>未进入本次牌阵</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>牌面列表</h2>
            <span className="status-text">{filteredDeckCards.length} 张</span>
          </div>

          <div className="gallery-tip">
            <p>列表与抽牌范围保持一致。你可以先按分类缩小范围，再在抽牌页只抽这类牌。</p>
          </div>

          <div className="card-gallery">
            {filteredDeckCards.map((card, index) => (
              <article key={card.id} className="gallery-card">
                {card.image && !failedCardImages.includes(card.id) ? (
                  <img
                    className="gallery-image"
                    src={card.image}
                    alt={card.name}
                    onError={() => markCardImageFailed(card.id)}
                  />
                ) : (
                  <div className="gallery-image placeholder">
                    <span>{card.name}</span>
                  </div>
                )}
                <div className="gallery-meta">
                  <strong>{card.name}</strong>
                  <p>序号：第 {index + 1} 张</p>
                  <p className="muted-text">{card.arcana === 'major' ? '大阿尔卡那' : card.arcana === 'minor' ? '小阿尔卡那' : '空白牌'}</p>
                  <p className="muted-text">{card.meaningUp}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>文档说明</h2>
          <span className="status-text">使用与扩展</span>
        </div>
        <div className="doc-grid">
          <article className="doc-card">
            <strong>适用场景</strong>
            <p>适合做个人抽牌、移动端占卜展示、塔罗内容页原型，以及后续继续接入真实牌义与图片资源。</p>
          </article>
          <article className="doc-card">
            <strong>当前规则</strong>
            <p>同一轮抽牌默认不重复，切换牌组或筛选条件后会自动重置当前抽牌流程。</p>
          </article>
          <article className="doc-card">
            <strong>扩展牌组</strong>
            <p>在 `public/assets/decks/你的牌组名/` 放图，在 `src/data/decks/` 新增 deck 并注册即可出现在页面里。</p>
          </article>
        </div>
        <div className="guide-list">
          {readingNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;

function getSpreadRotation(index: number): number {
  const pattern = [-5.4, -3.2, -1.4, 1.8, 3.9, 5.6, 2.6, -2.4];
  return pattern[index % pattern.length];
}

function getSpreadOffset(index: number): number {
  const pattern = [0, -6, -10, -4, -12, -7, -2, -8];
  return pattern[index % pattern.length];
}

function getCompletedRotation(index: number): number {
  const pattern = [-7, -4, -2, 2, 5, 7, 3, -3];
  return pattern[index % pattern.length];
}

function getCompletedOffset(index: number): number {
  const pattern = [0, -10, -4, -12, -6, -14, -5, -9];
  return pattern[index % pattern.length];
}

function renderCardVisual(card: TarotCard, orientation?: DrawnCard['orientation']) {
  return (
    <div className="spread-image-shell">
      <img
        className={`gallery-image spread-image ${orientation === 'reversed' ? 'is-reversed' : ''}`}
        src={card.image}
        alt={card.name}
      />
    </div>
  );
}

function getArcanaLabel(card: TarotCard): string {
  if (card.arcana === 'major') {
    return '大阿尔卡那';
  }

  if (card.arcana === 'minor') {
    return getSuitLabel(card);
  }

  return '空白牌';
}

function getSuitLabel(card: TarotCard): string {
  switch (card.suit) {
    case 'wands':
      return '权杖';
    case 'cups':
      return '圣杯';
    case 'swords':
      return '宝剑';
    case 'pentacles':
      return '星币';
    default:
      return '未分类';
  }
}

async function consumeSharedToken(token: string, deviceId: string): Promise<
  { ok: true; accessKey: string; watermarkText: string } | { ok: false; message: string }
> {
  try {
    const response = await fetch('/api/access/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ token, deviceId }),
    });

    const data = (await response.json()) as {
      ok?: boolean;
      message?: string;
      accessKey?: string;
      watermarkText?: string;
    };

    if (!response.ok || !data.accessKey || !data.watermarkText) {
      return { ok: false, message: data.message ?? '链接校验失败。' };
    }

    return { ok: true, accessKey: data.accessKey, watermarkText: data.watermarkText };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '无法连接验证服务。',
    };
  }
}

async function verifyAccessKey(
  key: string,
  deviceId: string,
): Promise<{ ok: true; watermarkText: string } | { ok: false }> {
  try {
    const response = await fetch(
      `/api/access/verify?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId)}`,
      {
        headers: {
          'x-device-id': deviceId,
        },
      },
    );

    if (!response.ok) {
      return { ok: false };
    }

    const data = (await response.json()) as { ok?: boolean; watermarkText?: string };
    return data.ok === true && data.watermarkText
      ? { ok: true, watermarkText: data.watermarkText }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function fetchProtectedDecks(key: string, deviceId: string): Promise<
  { ok: true; decks: TarotDeck[]; watermarkText: string } | { ok: false; message: string }
> {
  try {
    const response = await fetch(
      `/api/content/decks?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId)}`,
      {
        headers: {
          'x-device-id': deviceId,
        },
      },
    );

    const data = (await response.json()) as {
      ok?: boolean;
      message?: string;
      decks?: TarotDeck[];
      watermarkText?: string;
    };

    if (!response.ok || !data.decks || !data.watermarkText) {
      return { ok: false, message: data.message ?? '无法加载受保护的牌组内容。' };
    }

    return { ok: true, decks: data.decks, watermarkText: data.watermarkText };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '无法连接内容服务。',
    };
  }
}

function getOrCreateDeviceId(): string {
  const existing = window.localStorage.getItem(deviceStorageKey);

  if (existing) {
    return existing;
  }

  const created =
    window.crypto?.randomUUID?.().replace(/-/g, '') ??
    `${Date.now()}${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(deviceStorageKey, created);
  return created;
}

function getShareUrlReachability(url: string): { isPublic: boolean; message: string } {
  try {
    const host = new URL(url).hostname;

    if (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.2') ||
      host.startsWith('172.30.') ||
      host.startsWith('172.31.') ||
      host.startsWith('192.168.') ||
      host.startsWith('10.')
    ) {
      return {
        isPublic: false,
        message: '当前生成的是本地或内网地址。只有同一 Wi‑Fi 下才能访问；若要让非同一网络的微信用户打开，必须部署到公网 HTTPS 域名。',
      };
    }

    return {
      isPublic: true,
      message: '当前分享链接是公网地址，可用于非同一网络的微信访问。',
    };
  } catch {
    return {
      isPublic: false,
      message: '分享链接格式异常，请检查 PUBLIC_APP_URL 配置。',
    };
  }
}
