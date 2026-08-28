import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, CircleAlert, ClipboardList, Film, Gamepad2, Image as ImageIcon, ImagePlus, Layers3, LoaderCircle, MapPinned, Palette, Pause, PencilLine, Play, Plus, RotateCcw, Save, Star, Trash2, Upload, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ArtModule } from './data/modules'
import { spanishAdventureStaticImageAssets } from './data/spanishAdventureAssets'

type GameStatus = 'planned' | 'in_progress' | 'ready'
type ArtAssetGroup = 'common' | 'clue-teaching'
type ImageAsset = { id: string; name: string; originalName: string; imageUrl: string; width: number; height: number; status: string }
type MediaRequirements = { animation: boolean; sound: boolean }
type SoundEffect = { resourceRef: string; audioUrl: string; originalName: string; trigger: string; volume: number; updatedAt: string }
type GameManagedArtAsset = { id: string; order: number; name: string; description: string; variants: string; assetId: string; imageAssetIds: string[]; primaryImageAssetId: string; dynamicImageAssetIds: string[]; mediaRequirements: MediaRequirements; soundEffect: SoundEffect; status: GameStatus }
type Game = { id: string; name: string; category: string; description: string; ruleReference: string; assetId: string; status: GameStatus; updatedAt: string; artAssets: GameManagedArtAsset[] }
type GameArtAsset = { id: string; group: ArtAssetGroup; name: string; description: string; quantity: string; variants: string; assetId: string; imageAssetIds: string[]; primaryImageAssetId: string; dynamicImageAssetIds: string[]; mediaRequirements: MediaRequirements; soundEffect: SoundEffect; status: GameStatus; updatedAt: string }
type GameFrameSequence = { id: string; name: string; sourceType: string; sourceOriginalName?: string; sourceUrl?: string; manifestUrl?: string; frameUrls: string[]; fps: number; width: number; height: number; frameCount: number; duration: number; outputDirectory?: string; createdAt?: string }
type GameContent = { schemaVersion: number; projectId: string; updatedAt: string; games: Game[]; artAssets: GameArtAsset[] }
const statusCopy: Record<GameStatus, string> = { planned: '待制作', in_progress: '制作中', ready: '已就绪' }
const assetGroupCopy: Record<ArtAssetGroup, string> = { common: '通用游戏美术素材', 'clue-teaching': '线索卡教学阶段素材' }
const defaultCommonArtAssetIds = new Set(['clue-panel-background', 'clue-top-status-bar', 'clue-progress-indicator', 'clue-option-card', 'clue-listen-again-button', 'clue-exit-pause-button', 'clue-correct-feedback', 'clue-error-feedback', 'clue-unlock-animation', 'clue-new-player-overlay'])
const blankSoundEffect = (): SoundEffect => ({ resourceRef: '', audioUrl: '', originalName: '', trigger: '', volume: 100, updatedAt: '' })
const defaultMediaRequirements = (name: string, variants: string): MediaRequirements => {
  const text = `${name} ${variants}`
  return {
    animation: /动效|动画|序列帧|播放中|录音中|识别中|闪烁|脉冲|抖动/.test(text),
    sound: /语音|发音|播放|麦克风|正确反馈|错误反馈|识别成功|识别失败|匹配成功|匹配失败|全部完成|锁扣解开|解锁/.test(text),
  }
}
const normalizeMediaRequirements = (value: unknown, name: string, variants: string): MediaRequirements => {
  if (value && typeof value === 'object') return { animation: Boolean((value as MediaRequirements).animation), sound: Boolean((value as MediaRequirements).sound) }
  return defaultMediaRequirements(name, variants)
}
const normalizeSoundEffect = (value: unknown): SoundEffect => {
  const source = value && typeof value === 'object' ? value as Partial<SoundEffect> : {}
  return { resourceRef: String(source.resourceRef || ''), audioUrl: String(source.audioUrl || ''), originalName: String(source.originalName || ''), trigger: String(source.trigger || ''), volume: Math.min(100, Math.max(0, Number(source.volume) || 100)), updatedAt: String(source.updatedAt || '') }
}

function presetGameArtAssets(gameName: string): GameManagedArtAsset[] {
  const rows: Record<string, Array<[number, string, string, string]>> = {
    '听力开锁': [
      [17, '语音播放按钮', '大喇叭图标居中／顶部，点击播放目标词发音。', '默认／按下／禁用'],
      [18, '播放中状态', '喇叭图标 + 声波扩散动画 + “听一听”文字。', '播放中动效'],
      [19, '3 个图片选项', '每题 3 张配图卡片，1 张正确 + 2 张干扰项，从词汇配图库复用。', '默认／正确／干扰'],
      [20, '选项选中态', '点击后卡片金色描边高亮，等待判定。', '选中态'],
    ],
    '跟读开锁': [
      [21, '目标词展示卡', '居中显示当前要跟读的西语词（大字）+ 中文小字 + 音节分隔提示。', '默认'],
      [22, '麦克风大按钮', '圆形麦克风图标，金色发光，提示“按住说话”或“点击开始”。', '默认／按下／禁用'],
      [23, '录音中状态', '麦克风变红／金色脉冲 + 实时音量波形条动画 + “正在听…”。', '录音中动效'],
      [24, '识别中状态', '旋转加载圈 + “识别中…”。', '识别中动效'],
      [25, '识别成功', '绿色对勾 + 目标词高亮 + 正确特效。', '成功反馈'],
      [26, '识别失败提示', '柔和灰色“没听清，再试一次” + 麦克风按钮重新可点。', '失败反馈'],
      [27, '“换一题”按钮', '连续 3 次未识别后出现，切换为听选题。', '条件出现'],
    ],
    '图文配对': [
      [28, '图片槽位', '上方排列 2–4 张配图，带虚线边框占位。', '2／3／4 槽位'],
      [29, '单词卡（可拖拽）', '下方排列 2–4 张西语单词卡，圆角可拖拽。', '2／3／4 张'],
      [30, '拖拽中状态', '单词卡跟随手指／鼠标，半透明 + 轻微放大 + 阴影。', '拖拽动效'],
      [31, '槽位悬停态', '单词卡拖到图片上方时，槽位金色高亮描边。', '悬停态'],
      [32, '匹配成功', '单词卡吸附到图片下方 + 金色闪光 + 两者锁定。', '成功反馈'],
      [33, '匹配失败', '单词卡弹回原位 + 柔和灰色抖动，不消失，可重试。', '失败反馈'],
      [34, '全部完成', '所有配对完成后金光汇聚 + 锁扣解开。', '完成动效'],
    ],
  }
  return (rows[gameName] || []).map(([order, name, description, variants]) => ({ id: `${gameName}-${order}`, order, name, description, variants, assetId: '', imageAssetIds: [], primaryImageAssetId: '', dynamicImageAssetIds: [], mediaRequirements: defaultMediaRequirements(name, variants), soundEffect: blankSoundEffect(), status: 'planned' }))
}

function commonGameArtAssets(): GameArtAsset[] {
  const rows: Array<[string, string, string, string]> = [
    ['clue-panel-background', '解谜面板背景', '进入解谜后的全屏／半屏面板，温暖米白底 + 金色圆角边框。', '默认／弹出动画'],
    ['clue-top-status-bar', '顶部状态栏', '显示当前题型图标 + 题目进度（如 2/5）。', '—'],
    ['clue-progress-indicator', '进度指示器', '3–5 个圆点，已答为金色填充，当前为金色描边，未答为灰金。', '3 题／4 题／5 题三种布局'],
    ['clue-option-card', '选项卡片通用底', '圆角卡片，米白底 + 深棕描边，可点击态。', '默认／悬停／按下／正确／错误'],
    ['clue-listen-again-button', '“再听一遍”按钮', '喇叭图标 + 文字，常驻可点。', '默认／按下／禁用'],
    ['clue-exit-pause-button', '退出／暂停按钮', '左上角返回，需二次确认“确定离开？宝箱保持上锁”。', '默认／按下'],
    ['clue-correct-feedback', '正确反馈特效', '金色闪光粒子 + 轻微描边 + 上扬音效视觉化。', '粒子序列帧'],
    ['clue-error-feedback', '错误反馈特效', '柔和灰色抖动 + 向导小精灵提示气泡“再试一次”。', '抖动动画'],
    ['clue-unlock-animation', '锁扣解开动画', '全部答对后，宝箱锁扣旋转弹开 + 金光迸发。', '序列帧动画'],
    ['clue-new-player-overlay', '新手引导遮罩', '首次解谜时的半透明遮罩 + 手指引导 + 文字提示。', '逐步提示 3–4 步'],
  ]
  return rows.map(([id, name, description, variants]) => ({ id, group: 'common', name, description, quantity: '', variants, assetId: '', imageAssetIds: [], primaryImageAssetId: '', dynamicImageAssetIds: [], mediaRequirements: defaultMediaRequirements(name, variants), soundEffect: blankSoundEffect(), status: 'planned', updatedAt: '' }))
}

function clueTeachingArtAssets(): GameArtAsset[] {
  const rows: Array<[string, string, string, string, string]> = [
    ['clue-card-panel', '线索卡面板', '可左右滑动的卡片容器，顶部显示“学会这些词就能打开宝箱”。', '1 套', '默认'],
    ['clue-word-card-front', '词汇卡正面', '西语原文（大字）+ 中文释义（小字）+ 配图 + 发音按钮。', '每词 1 张，每宝箱 2–4 张', '可翻页'],
    ['clue-word-illustration', '词汇配图', '每个新词对应的手绘风格插图（如 rojo = 红色苹果，gato = 猫）。', '每词 1 张，是最大美术工作量', '静态配图'],
    ['clue-pronunciation-button', '发音按钮', '喇叭图标，点击播放西语发音。', '1 个', '默认／播放中（声波动画）'],
    ['clue-page-slider-indicator', '翻页／滑动指示器', '底部小圆点显示当前第几张。', '2／3／4 词三种', '默认／当前'],
    ['clue-start-challenge-button', '“开始挑战”按钮', '教学完成后出现，金色高亮大按钮。', '1 个', '默认／按下'],
  ]
  return rows.map(([id, name, description, quantity, variants]) => ({ id, group: 'clue-teaching', name, description, quantity, variants, assetId: '', imageAssetIds: [], primaryImageAssetId: '', dynamicImageAssetIds: [], mediaRequirements: defaultMediaRequirements(name, variants), soundEffect: blankSoundEffect(), status: 'planned', updatedAt: '' }))
}

function defaultGameArtAssets() { return [...commonGameArtAssets(), ...clueTeachingArtAssets()] }

function emptyContent(projectId: string): GameContent { return { schemaVersion: 5, projectId, updatedAt: '', games: [], artAssets: defaultGameArtAssets() } }
function normalizeContent(projectId: string, value: GameContent | null): GameContent {
  const source = value || emptyContent(projectId)
  const persistedArtAssets = Array.isArray(source.artAssets) ? source.artAssets : defaultGameArtAssets()
  const artAssets = Number(source.schemaVersion || 0) < 4 ? [...persistedArtAssets, ...defaultGameArtAssets().filter((asset) => !persistedArtAssets.some((existing) => existing.id === asset.id))] : persistedArtAssets
  const games = (Array.isArray(source.games) ? source.games : []).map((game, index) => {
    const managedAssets = Array.isArray(game.artAssets) ? game.artAssets : presetGameArtAssets(game.name || game.category || '')
    return { ...game, id: game.id || `game-${index + 1}`, name: game.name || '', category: game.category || '', description: game.description || '', ruleReference: game.ruleReference || '', assetId: game.assetId || '', status: statusCopy[game.status] ? game.status : 'planned', updatedAt: game.updatedAt || '', artAssets: managedAssets.map((asset, assetIndex) => { const imageAssetIds = Array.isArray(asset.imageAssetIds) ? asset.imageAssetIds : asset.assetId ? [asset.assetId] : []; const primaryImageAssetId = imageAssetIds.includes(asset.primaryImageAssetId) ? asset.primaryImageAssetId : imageAssetIds[0] || ''; const name = asset.name || ''; const variants = asset.variants || ''; return { id: asset.id || `${game.id || `game-${index + 1}`}-art-${assetIndex + 1}`, order: Number(asset.order) || assetIndex + 1, name, description: asset.description || '', variants, assetId: primaryImageAssetId, imageAssetIds, primaryImageAssetId, dynamicImageAssetIds: Array.isArray(asset.dynamicImageAssetIds) ? asset.dynamicImageAssetIds.filter((id) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(id || '')) : [], mediaRequirements: normalizeMediaRequirements(asset.mediaRequirements, name, variants), soundEffect: normalizeSoundEffect(asset.soundEffect), status: statusCopy[asset.status] ? asset.status : 'planned' } }) }
  })
  return { ...source, schemaVersion: 5, projectId, games, artAssets: artAssets.map((asset, index) => { const id = asset.id || `game-art-${index + 1}`; const imageAssetIds = [...new Set([...(Array.isArray(asset.imageAssetIds) ? asset.imageAssetIds : []), asset.primaryImageAssetId, asset.assetId].filter((assetId) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(assetId || '')))]; const primaryImageAssetId = imageAssetIds.includes(asset.primaryImageAssetId) ? asset.primaryImageAssetId : imageAssetIds[0] || ''; const name = asset.name || ''; const variants = asset.variants || ''; return { id, group: asset.group === 'common' || defaultCommonArtAssetIds.has(id) ? 'common' : 'clue-teaching', name, description: asset.description || '', quantity: asset.quantity || '', variants, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId, dynamicImageAssetIds: Array.isArray(asset.dynamicImageAssetIds) ? asset.dynamicImageAssetIds.filter((assetId) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(assetId || '')) : [], mediaRequirements: normalizeMediaRequirements(asset.mediaRequirements, name, variants), soundEffect: normalizeSoundEffect(asset.soundEffect), status: statusCopy[asset.status] ? asset.status : 'planned', updatedAt: asset.updatedAt || '' } }) }
}
function blankGame(): Game { return { id: `game_${Date.now()}`, name: '', category: '', description: '', ruleReference: '详细玩法设计', assetId: '', status: 'planned', updatedAt: '', artAssets: [] } }
function blankArtAsset(group: ArtAssetGroup): GameArtAsset { return { id: `game_art_${Date.now()}`, group, name: '', description: '', quantity: '', variants: '', assetId: '', imageAssetIds: [], primaryImageAssetId: '', dynamicImageAssetIds: [], mediaRequirements: { animation: false, sound: false }, soundEffect: blankSoundEffect(), status: 'planned', updatedAt: '' } }

type DetailedGameplayReference = { sourceTitle: string; summary: string; items: Array<{ sectionTitle: string; text: string }> }

function plainGameplayText(value: string) { return value.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim() }

function detailedGameplayReferenceForGame(game: Pick<Game, 'name' | 'category' | 'ruleReference'>, module?: ArtModule): DetailedGameplayReference | null {
  if (!module) return null
  const explicitReference = game.ruleReference.trim()
  const explicitSection = explicitReference && explicitReference !== '详细玩法设计'
    ? module.sections.find((section) => [section.id, section.label, section.title].includes(explicitReference))
    : undefined
  if (explicitSection) {
    const items = explicitSection.items.slice(0, 4).map((item) => ({ sectionTitle: explicitSection.title, text: plainGameplayText(item) }))
    return { sourceTitle: explicitSection.title, summary: plainGameplayText(explicitSection.description || explicitSection.items[0] || '该分组尚未填写玩法内容。'), items }
  }

  const gameName = `${game.name} ${game.category}`
  const patterns = gameName.includes('跟读')
    ? ['三题型轮换', '跟读题交互流程', '本地ASR不可用降级', '跟读识别规则']
    : gameName.includes('听力') || gameName.includes('听选')
      ? ['三题型轮换', '音频播放规则', '失败与重试']
      : gameName.includes('图文') || gameName.includes('配对')
        ? ['三题型轮换', '题型生命周期', '失败与重试']
        : []
  const items = module.sections.flatMap((section) => section.items
    .filter((item) => patterns.some((pattern) => item.includes(pattern)))
    .map((item) => ({ sectionTitle: section.title, text: plainGameplayText(item) })))
  const fallbackSection = module.sections.find((section) => section.title.includes('语言解谜')) || module.sections[0]
  const referenceItems = items.length ? items : (fallbackSection?.items.slice(0, 3).map((item) => ({ sectionTitle: fallbackSection.title, text: plainGameplayText(item) })) || [])
  const sourceTitles = [...new Set(referenceItems.map((item) => item.sectionTitle))]
  return {
    sourceTitle: sourceTitles.length ? sourceTitles.join('、') : module.title,
    summary: referenceItems[0]?.text || plainGameplayText(fallbackSection?.description || '详细玩法设计尚未填写可引用内容。'),
    items: referenceItems,
  }
}

export function GameContentPage({ projectId, staticDemo, mainVisualModule, detailedGameplayModule }: { projectId: string; staticDemo: boolean; mainVisualModule?: ArtModule; detailedGameplayModule?: ArtModule }) {
  const [content, setContent] = useState<GameContent | null>(null)
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([])
  const [draft, setDraft] = useState<{ isNew: boolean; value: Game } | null>(null)
  const [assetDraft, setAssetDraft] = useState<{ isNew: boolean; value: GameArtAsset } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    void (async () => {
      setContent(null); setDraft(null); setAssetDraft(null); setMessage(null)
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:game-content:${projectId}:v1`)
          setContent(normalizeContent(projectId, stored ? JSON.parse(stored) : null)); setImageAssets(spanishAdventureStaticImageAssets.filter((asset) => asset.moduleId === 'game-content'))
        } else {
          const [response, assetResponse] = await Promise.all([fetch(`/api/projects/${projectId}/game-content`), fetch(`/api/image-assets?${new URLSearchParams({ projectId, moduleId: 'game-content' })}`)])
          const [result, assetResult] = await Promise.all([response.json(), assetResponse.json()])
          if (!response.ok) throw new Error(result.error || '游戏内容读取失败。')
          if (!assetResponse.ok) throw new Error(assetResult.error || '游戏美术素材读取失败。')
          setContent(normalizeContent(projectId, result))
          setImageAssets(assetResult)
        }
      } catch (error) {
        setContent(null); setMessage({ type: 'error', text: error instanceof Error ? error.message : '游戏内容读取失败。' })
      }
    })()
  }, [projectId, staticDemo])

  const uploadGameArtImages = async (game: Game, asset: GameManagedArtAsset, files: File[]) => {
    if (staticDemo) throw new Error('在线演示版不支持文件上传，请在本地平台中管理游戏美术素材。')
    const formData = new FormData()
    files.forEach((file) => formData.append('images', file))
    formData.append('projectId', projectId)
    formData.append('moduleId', 'game-content')
    formData.append('name', `${game.name || '游戏'} · ${asset.name || '美术素材'}`)
    const response = await fetch('/api/image-assets', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '游戏美术素材上传失败。')
    setImageAssets((current) => [...result, ...current])
    return result as ImageAsset[]
  }

  const uploadGlobalArtImages = async (asset: GameArtAsset, files: File[]) => {
    if (staticDemo) throw new Error('在线演示版不支持文件上传，请在本地平台中管理游戏美术素材。')
    const formData = new FormData()
    files.forEach((file) => formData.append('images', file))
    formData.append('projectId', projectId)
    formData.append('moduleId', 'game-content')
    formData.append('name', `${asset.name || '游戏美术素材'} · 图片`)
    const response = await fetch('/api/image-assets', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '游戏美术素材上传失败。')
    setImageAssets((current) => [...result, ...current])
    return result as ImageAsset[]
  }

  useEffect(() => {
    if (!draft && !assetDraft) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [draft, assetDraft])

  const persist = async (nextContent: GameContent, success: string) => {
    setSaving(true); setMessage(null)
    try {
      const value = { ...nextContent, schemaVersion: 5, updatedAt: new Date().toISOString() }
      if (staticDemo) {
        window.localStorage.setItem(`artflow:game-content:${projectId}:v1`, JSON.stringify(value)); setContent(value)
      } else {
        const response = await fetch(`/api/projects/${projectId}/game-content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: value }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '游戏内容保存失败。')
        setContent(normalizeContent(projectId, result.content))
      }
      setDraft(null); setAssetDraft(null); setMessage({ type: 'success', text: success })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '游戏内容保存失败。' })
    } finally { setSaving(false) }
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content || !draft) return
    const game = {
      ...draft.value,
      id: draft.value.id.trim(),
      name: draft.value.name.trim(),
      category: draft.value.category.trim(),
      artAssets: draft.value.artAssets.map((asset, index) => {
        const imageAssetIds = [...new Set(asset.imageAssetIds.map((id) => id.trim()).filter(Boolean))]
        const primaryImageAssetId = imageAssetIds.includes(asset.primaryImageAssetId) ? asset.primaryImageAssetId : imageAssetIds[0] || ''
        return { ...asset, id: asset.id.trim() || `${draft.value.id.trim()}-art-${index + 1}`, order: Math.max(1, Math.round(Number(asset.order) || index + 1)), name: asset.name.trim(), description: asset.description.trim(), variants: asset.variants.trim(), assetId: primaryImageAssetId, imageAssetIds, primaryImageAssetId }
      }),
    }
    if (!game.id || !game.name || !game.category) return setMessage({ type: 'error', text: '请填写稳定 ID、游戏名称和游戏类型。' })
    if (game.artAssets.some((asset) => !asset.name || !asset.description)) return setMessage({ type: 'error', text: '每项游戏美术内容都必须填写素材名称和说明。' })
    if (new Set(game.artAssets.map((asset) => asset.id)).size !== game.artAssets.length) return setMessage({ type: 'error', text: '游戏美术内容存在重复的稳定 ID。' })
    const games = draft.isNew ? [...content.games, game] : content.games.map((item) => item.id === game.id ? game : item)
    void persist({ ...content, games }, draft.isNew ? `已新增游戏“${game.name}”。` : `已更新游戏“${game.name}”。`)
  }

  const saveArtAsset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content || !assetDraft) return
    const imageAssetIds = [...new Set([...(Array.isArray(assetDraft.value.imageAssetIds) ? assetDraft.value.imageAssetIds : []), assetDraft.value.primaryImageAssetId, assetDraft.value.assetId].filter((assetId) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(assetId || '')))]
    const primaryImageAssetId = imageAssetIds.includes(assetDraft.value.primaryImageAssetId) ? assetDraft.value.primaryImageAssetId : imageAssetIds[0] || ''
    const asset = { ...assetDraft.value, id: assetDraft.value.id.trim(), name: assetDraft.value.name.trim(), description: assetDraft.value.description.trim(), quantity: assetDraft.value.quantity.trim(), variants: assetDraft.value.variants.trim(), imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId, updatedAt: new Date().toISOString() }
    if (!asset.id || !asset.name || !asset.description) return setMessage({ type: 'error', text: '请填写素材稳定 ID、素材名称和说明。' })
    if (assetDraft.isNew && content.artAssets.some((item) => item.id === asset.id)) return setMessage({ type: 'error', text: '游戏美术素材 ID 已存在，请使用唯一 ID。' })
    const artAssets = assetDraft.isNew ? [...content.artAssets, asset] : content.artAssets.map((item) => item.id === asset.id ? asset : item)
    void persist({ ...content, artAssets }, assetDraft.isNew ? `已新增${assetGroupCopy[asset.group]}“${asset.name}”。` : `已更新美术素材“${asset.name}”。`)
  }

  const remove = (game: Game) => {
    if (!content || !window.confirm(`确定删除游戏内容“${game.name}”吗？已引用它的城市条目会保留引用并提示待修复。`)) return
    void persist({ ...content, games: content.games.filter((item) => item.id !== game.id) }, `已删除游戏“${game.name}”。`)
  }
  const removeArtAsset = (asset: GameArtAsset) => {
    if (!content || !window.confirm(`确定删除游戏美术素材“${asset.name}”吗？`)) return
    void persist({ ...content, artAssets: content.artAssets.filter((item) => item.id !== asset.id) }, `已删除美术素材“${asset.name}”。`)
  }

  if (!content) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取游戏内容…</div>
  return <div className="game-content-page page-enter">
    <section className="game-content-hero"><div><span className="section-kicker"><Gamepad2 size={14} /> GAME CONTENT CATALOG</span><h1>游戏管理</h1><p>维护可被城市引用的语言互动或小游戏内容，以及通用游戏美术素材和线索卡教学阶段素材。城市内容管理只保存游戏 ID 及其出现位置。</p></div><div><Link className="button ghost" to="/modules/detailed-gameplay-design"><ClipboardList size={16} /> 查看详细玩法规则</Link><Link className="button ghost" to="/city-content-management"><MapPinned size={16} /> 查看城市引用</Link><button className="button primary" onClick={() => setDraft({ isNew: true, value: blankGame() })}><Plus size={17} /> 新增游戏</button></div></section>
    {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}
    <GameMainVisualAuthority mainVisualModule={mainVisualModule} />
    {draft && createPortal(<div className="city-entity-modal-backdrop"><div className="city-entity-modal game-editor-modal" role="dialog" aria-modal="true" aria-label={draft.isNew ? '新增游戏内容' : '编辑游戏内容'}><GameEditor projectId={projectId} staticDemo={staticDemo} detailedGameplayModule={detailedGameplayModule} draft={draft} imageAssets={imageAssets} saving={saving} onUpload={uploadGameArtImages} onChange={(value) => setDraft({ ...draft, value })} onCancel={() => setDraft(null)} onSave={save} /></div></div>, document.body)}
    {assetDraft && createPortal(<div className="city-entity-modal-backdrop"><div className="city-entity-modal game-editor-modal" role="dialog" aria-modal="true" aria-label={assetDraft.isNew ? '新增游戏美术素材' : '编辑游戏美术素材'}><GameArtAssetEditor projectId={projectId} staticDemo={staticDemo} imageAssets={imageAssets} draft={assetDraft} saving={saving} onUpload={uploadGlobalArtImages} onChange={(value) => setAssetDraft({ ...assetDraft, value })} onCancel={() => setAssetDraft(null)} onRemove={() => removeArtAsset(assetDraft.value)} onSave={saveArtAsset} /></div></div>, document.body)}
    <GameArtAssetSection title="通用游戏美术素材" description="维护可由多个游戏共用的界面、交互和反馈素材。每项均继承项目主视觉的色彩、材质、光照、圆角与禁止项。" assets={content.artAssets.filter((asset) => asset.group === 'common')} imageAssets={imageAssets} saving={saving} onAdd={() => setAssetDraft({ isNew: true, value: blankArtAsset('common') })} onEdit={(value) => setAssetDraft({ isNew: false, value: { ...value } })} onRemove={removeArtAsset} />
    <GameArtAssetSection title="线索卡教学阶段素材" description="仅维护线索卡教学流程独有、无法由通用游戏素材复用的内容；当前预置素材均已归入通用游戏美术素材。" assets={content.artAssets.filter((asset) => asset.group === 'clue-teaching')} imageAssets={imageAssets} saving={saving} onAdd={() => setAssetDraft({ isNew: true, value: blankArtAsset('clue-teaching') })} onEdit={(value) => setAssetDraft({ isNew: false, value: { ...value } })} onRemove={removeArtAsset} />
    <section className="game-catalog-section"><header><div><span className="eyebrow"><span /> PROJECT GAME CONTENT</span><h2>游戏目录</h2></div><strong>{content.games.length} 个游戏</strong></header>{content.games.length === 0 ? <div className="game-empty"><Gamepad2 size={31} /><strong>还没有游戏内容</strong><p>先建立游戏定义，再在城市内容管理中引用为片区互动或宝箱挑战。</p><button className="button primary" onClick={() => setDraft({ isNew: true, value: blankGame() })}><Plus size={16} /> 新增第一个游戏</button></div> : <div className="game-card-grid">{content.games.map((game) => { const gameplayReference = detailedGameplayReferenceForGame(game, detailedGameplayModule); return <article className="game-card" key={game.id}><div className="game-card-actions"><button onClick={() => setDraft({ isNew: false, value: { ...game, artAssets: game.artAssets.map((asset) => ({ ...asset })) } })} aria-label={`编辑 ${game.name}`}><PencilLine size={14} /></button><button onClick={() => remove(game)} disabled={saving} aria-label={`删除 ${game.name}`}><Trash2 size={14} /></button></div><span>{game.category} · {statusCopy[game.status]}</span><h3>{game.name}</h3><p>{gameplayReference?.summary || game.description || '详细玩法设计尚未加载。'}</p><small>详细玩法：{gameplayReference?.sourceTitle || game.ruleReference || '未找到引用'}</small>{game.description && <small>补充说明：{game.description}</small>}<small>本游戏美术内容：{game.artAssets.length} 项</small>{game.assetId && <small>素材资产：{game.assetId}</small>}<code>{game.id}</code></article> })}</div>}</section>
    <section className="game-reference-note"><Layers3 size={19} /><div><strong>引用约定</strong><p>城市内容管理中的游戏模块只保存游戏内容 ID、所属片区、关联宝箱和城市内状态；游戏本体、通用素材和线索卡教学素材均以本页为唯一来源。</p></div></section>
  </div>
}

function GameMainVisualAuthority({ mainVisualModule }: { mainVisualModule?: ArtModule }) {
  if (!mainVisualModule) return <section className="game-visual-authority is-missing"><Palette size={20} /><div><strong>未找到主视觉设计要求</strong><p>请先建立主视觉设计；游戏美术素材暂时无法获得项目级色彩、材质、光照、镜头与禁止项约束。</p></div><Link className="button ghost" to="/modules/main-visual-design/requirements">前往主视觉设计 <ArrowRight size={15} /></Link></section>
  return <section className="game-visual-authority"><header><div><Palette size={20} /><span><small>INHERITED ART DIRECTION · READ ONLY</small><strong>游戏美术素材继承项目主视觉设计</strong><p>通用素材与线索卡教学素材不保存独立风格副本。主视觉变更后，所有已入库的游戏素材都应进入复核。</p></span></div><Link className="button ghost" to="/modules/main-visual-design/requirements">查看并编辑主视觉 <ArrowRight size={15} /></Link></header><div className="game-visual-rules">{mainVisualModule.sections.map((section) => <article key={section.id}><small>{section.label}</small><h3>{section.title}</h3><p>{section.description}</p><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div></section>
}

function GameArtAssetSection({ title, description, assets, imageAssets, saving, onAdd, onEdit, onRemove }: { title: string; description: string; assets: GameArtAsset[]; imageAssets: ImageAsset[]; saving: boolean; onAdd: () => void; onEdit: (asset: GameArtAsset) => void; onRemove: (asset: GameArtAsset) => void }) {
  return <section className="game-art-section"><header><div><span className="eyebrow"><span /> GAME ART ASSET CATALOG</span><h2>{title}</h2><p>{description}</p></div><div><strong>{assets.length} 项</strong><button className="button ghost" onClick={onAdd}><Plus size={15} /> 新增素材</button></div></header>{assets.length === 0 ? <div className="game-art-empty"><ImageIcon size={24} /><span>尚未维护{title}。</span><button className="button ghost" onClick={onAdd}><Plus size={14} /> 新增第一项</button></div> : <div className="game-art-card-grid">{assets.map((asset, index) => <GameArtAssetCard key={asset.id} asset={asset} index={index} image={imageAssets.find((image) => image.id === asset.assetId)} saving={saving} onEdit={() => onEdit(asset)} onRemove={() => onRemove(asset)} />)}</div>}</section>
}

function GameArtAssetCard({ asset, index, image, saving, onEdit, onRemove }: { asset: GameArtAsset; index: number; image?: ImageAsset; saving: boolean; onEdit: () => void; onRemove: () => void }) {
  return <article className="game-art-card"><button type="button" className="game-art-card-main" onClick={onEdit} aria-label={`编辑 ${asset.name}`}><div className="game-art-card-preview">{image ? <img src={image.imageUrl} alt={`${asset.name}预览`} /> : <ImageIcon size={25} />}{image && <span>已关联</span>}</div><footer><small>{String(index + 1).padStart(2, '0')} · {statusCopy[asset.status]}</small><strong>{asset.name || '未命名美术素材'}</strong><p>{asset.variants || asset.quantity || '未填写状态／变体'}</p></footer></button><div className="game-art-card-actions"><button type="button" onClick={onEdit} aria-label={`编辑 ${asset.name}`}><PencilLine size={14} /></button><button type="button" onClick={onRemove} disabled={saving} aria-label={`删除 ${asset.name}`}><Trash2 size={14} /></button></div></article>
}

function GameEditor({ projectId, staticDemo, detailedGameplayModule, draft, imageAssets, saving, onUpload, onChange, onCancel, onSave }: { projectId: string; staticDemo: boolean; detailedGameplayModule?: ArtModule; draft: { isNew: boolean; value: Game }; imageAssets: ImageAsset[]; saving: boolean; onUpload: (game: Game, asset: GameManagedArtAsset, files: File[]) => Promise<ImageAsset[]>; onChange: (value: Game) => void; onCancel: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const game = draft.value
  const [assetDraftId, setAssetDraftId] = useState<string | null>(null)
  const set = <K extends keyof Game>(key: K, value: Game[K]) => onChange({ ...game, [key]: value })
  const updateManagedAsset = (id: string, patch: Partial<GameManagedArtAsset>) => set('artAssets', game.artAssets.map((asset) => asset.id === id ? { ...asset, ...patch } : asset))
  const addManagedAsset = () => {
    const asset = { id: `${game.id || 'game'}-art-${Date.now()}`, order: game.artAssets.length ? Math.max(...game.artAssets.map((item) => item.order)) + 1 : 1, name: '', description: '', variants: '', assetId: '', imageAssetIds: [], primaryImageAssetId: '', dynamicImageAssetIds: [], mediaRequirements: { animation: false, sound: false }, soundEffect: blankSoundEffect(), status: 'planned' } satisfies GameManagedArtAsset
    set('artAssets', [...game.artAssets, asset]); setAssetDraftId(asset.id)
  }
  const removeManagedAsset = (id: string) => set('artAssets', game.artAssets.filter((asset) => asset.id !== id))
  const activeAsset = game.artAssets.find((asset) => asset.id === assetDraftId)
  const gameplayReference = detailedGameplayReferenceForGame(game, detailedGameplayModule)
  return <><form className="game-editor" onSubmit={onSave}><header><div><span>{draft.isNew ? 'NEW GAME' : 'EDIT GAME'}</span><h2>{draft.isNew ? '新增游戏内容' : `编辑 ${game.name}`}</h2></div><button type="button" onClick={onCancel}><X size={18} /></button></header><div className="game-editor-grid"><label><span>游戏内容 ID *</span><input value={game.id} disabled={!draft.isNew} onChange={(event) => set('id', event.target.value)} placeholder="game_picture_match" /></label><label><span>游戏名称 *</span><input value={game.name} onChange={(event) => set('name', event.target.value)} placeholder="图文配对" /></label><label><span>游戏类型 *</span><input value={game.category} onChange={(event) => set('category', event.target.value)} placeholder="听选、图文配对、跟读…" /></label><label><span>制作状态</span><select value={game.status} onChange={(event) => set('status', event.target.value as GameStatus)}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>规则引用</span><input value={game.ruleReference} onChange={(event) => set('ruleReference', event.target.value)} placeholder="详细玩法设计 / 分组 ID" /></label><label><span>素材资产 ID</span><input value={game.assetId} onChange={(event) => set('assetId', event.target.value)} placeholder="可选：资产注册中心 ID" /></label><label className="full"><span>游戏补充说明（可选）</span><textarea rows={3} value={game.description} onChange={(event) => set('description', event.target.value)} placeholder="只填写本游戏独有的补充；玩法规则请在详细玩法设计中维护。" /></label></div><GameDetailedGameplayReference reference={gameplayReference} /><section className="game-managed-art-assets"><header><div><span>GAME-SPECIFIC ART CONTENT</span><h3>本游戏要管理的美术内容</h3><p>每项素材可上传图片或动图作为正式 source 素材，并在卡片中预览；点击卡片管理设定、状态与素材关联。</p></div><button type="button" className="button ghost" onClick={addManagedAsset}><Plus size={15} /> 新增美术内容</button></header>{game.artAssets.length === 0 ? <div className="game-managed-art-empty">尚未定义本游戏专属美术内容。</div> : <div className="game-managed-art-list">{[...game.artAssets].sort((first, second) => first.order - second.order).map((asset) => <GameManagedArtPreview key={asset.id} asset={asset} image={imageAssets.find((image) => image.id === asset.primaryImageAssetId)} onOpen={() => setAssetDraftId(asset.id)} />)}</div>}</section><footer><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存游戏内容</button></footer></form>{activeAsset && createPortal(<GameManagedArtAssetDialog projectId={projectId} staticDemo={staticDemo} game={game} asset={activeAsset} imageAssets={imageAssets} onUpload={onUpload} onChange={(asset) => updateManagedAsset(activeAsset.id, asset)} onRemove={() => { removeManagedAsset(activeAsset.id); setAssetDraftId(null) }} onClose={() => setAssetDraftId(null)} />, document.body)}</>
}

function GameDetailedGameplayReference({ reference }: { reference: DetailedGameplayReference | null }) {
  if (!reference) return <section className="gameplay-reference-panel is-missing"><CircleAlert size={18} /><div><strong>未找到详细玩法设计</strong><p>请先维护详细玩法设计；游戏目录暂时无法显示可同步的玩法说明。</p></div><Link className="button ghost" to="/modules/detailed-gameplay-design">前往详细玩法设计 <ArrowRight size={15} /></Link></section>
  return <section className="gameplay-reference-panel"><header><div><ClipboardList size={18} /><span><small>INHERITED GAMEPLAY · READ ONLY</small><strong>游戏说明引用：{reference.sourceTitle}</strong><p>这部分随详细玩法设计实时更新，不会复制写入游戏内容。</p></span></div><Link className="button ghost" to="/modules/detailed-gameplay-design">编辑详细玩法 <ArrowRight size={15} /></Link></header><ul>{reference.items.map((item, index) => <li key={`${item.sectionTitle}-${index}`}><small>{item.sectionTitle}</small><span>{item.text}</span></li>)}</ul></section>
}

function GameManagedArtPreview({ asset, image, onOpen }: { asset: GameManagedArtAsset; image?: ImageAsset; onOpen: () => void }) {
  const mediaRequirements = asset.mediaRequirements || defaultMediaRequirements(asset.name, asset.variants)
  return <button type="button" className="game-managed-art-preview" onClick={onOpen}><div>{image ? <img src={image.imageUrl} alt={`${asset.name}预览`} /> : <ImageIcon size={25} />}{image && <span>已上传</span>}</div><footer><small>{String(asset.order).padStart(2, '0')} · {statusCopy[asset.status]}</small><strong>{asset.name || '未命名美术内容'}</strong><p>{asset.variants || '未填写状态／变体'}</p>{(mediaRequirements.animation || mediaRequirements.sound) && <i>{mediaRequirements.animation && <Film size={11} />}{mediaRequirements.sound && <Volume2 size={11} />}</i>}</footer></button>
}

function GameArtMediaRequirements({ value, onChange }: { value: MediaRequirements; onChange: (value: MediaRequirements) => void }) {
  return <fieldset className="game-art-media-requirements"><legend>按需管理的媒体</legend><label><input type="checkbox" checked={value.animation} onChange={(event) => onChange({ ...value, animation: event.target.checked })} />需要动态素材</label><label><input type="checkbox" checked={value.sound} onChange={(event) => onChange({ ...value, sound: event.target.checked })} />需要关联音效</label><small>未勾选的静态素材只保留图片管理，不显示额外上传区域。</small></fieldset>
}

function GameArtDynamicImageManager({ assetId, staticDemo, imageAssets, dynamicImageAssetIds, onUpload, onChange }: { assetId: string; staticDemo: boolean; imageAssets: ImageAsset[]; dynamicImageAssetIds: string[]; onUpload: (files: File[]) => Promise<ImageAsset[]>; onChange: (ids: string[]) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const dynamicAssets = imageAssets.filter((image) => dynamicImageAssetIds.includes(image.id))
  const upload = async () => {
    if (!files.length) return setError('请选择至少一个 GIF 动图。')
    setUploading(true); setError('')
    try {
      const created = await onUpload(files)
      onChange([...new Set([...dynamicImageAssetIds, ...created.map((image) => image.id)])])
      setFiles([])
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : '动图上传失败。') } finally { setUploading(false) }
  }
  return <section className="game-art-detail-section game-art-dynamic-images"><header><div><Film size={18} /><span><strong>动图素材</strong><small>仅在本素材需要动态表现时管理 GIF；静态图片不会出现在此区域。</small></span></div><strong>{dynamicAssets.length} 个</strong></header>{staticDemo ? <p className="pet-image-demo">在线演示版不支持动图上传，请在本地平台中管理动态素材。</p> : <div className="pet-image-upload"><label htmlFor={`game-art-dynamic-upload-${assetId}`}><input id={`game-art-dynamic-upload-${assetId}`} type="file" accept="image/gif,.gif" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><Film size={18} /><span>{files.length ? `已选择 ${files.length} 个动图` : '选择 GIF 动图'}</span></label><button type="button" className="button primary" onClick={() => void upload()} disabled={uploading || files.length === 0}>{uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploading ? '正在上传…' : '上传并关联'}</button></div>}{error && <p className="game-art-detail-error">{error}</p>}{dynamicAssets.length === 0 ? <div className="game-art-sequence-empty"><Film size={19} /> 尚未关联 GIF 动图。</div> : <div className="pet-image-grid">{dynamicAssets.map((image) => <article key={image.id}><img src={image.imageUrl} alt={`${image.name}动图预览`} /><div><strong>{image.name}</strong><small>{image.width}×{image.height}</small></div><footer><button type="button" onClick={() => onChange(dynamicImageAssetIds.filter((id) => id !== image.id))}><X size={13} /> 移除引用</button></footer></article>)}</div>}</section>
}

function GameArtSoundEffectManager({ projectId, staticDemo, target, value, onChange }: { projectId: string; staticDemo: boolean; target: { scope: 'global' | 'managed'; assetId: string; gameId?: string }; value: SoundEffect; onChange: (value: SoundEffect) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const upload = async () => {
    if (!file) return setError('请选择一段音效。')
    setUploading(true); setError('')
    try {
      const formData = new FormData()
      formData.append('audio', file); formData.append('scope', target.scope); formData.append('assetId', target.assetId); formData.append('projectId', projectId)
      if (target.gameId) formData.append('gameId', target.gameId)
      const response = await fetch(`/api/projects/${projectId}/game-art-sound-effects`, { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '音效上传失败。')
      onChange({ ...value, ...result.soundEffect, trigger: value.trigger, volume: value.volume })
      setFile(null)
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : '音效上传失败。') } finally { setUploading(false) }
  }
  const remove = async () => {
    if (!value.resourceRef) return onChange(blankSoundEffect())
    if (!window.confirm(`确定移除音效“${value.originalName || '未命名音效'}”吗？源文件也会从项目中删除。`)) return
    setError('')
    try {
      const params = new URLSearchParams({ scope: target.scope, assetId: target.assetId })
      if (target.gameId) params.set('gameId', target.gameId)
      const response = await fetch(`/api/projects/${projectId}/game-art-sound-effects?${params}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '音效删除失败。')
      onChange(blankSoundEffect())
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : '音效删除失败。') }
  }
  return <section className="game-art-detail-section game-art-sound-manager"><header><div><Volume2 size={18} /><span><strong>关联音效</strong><small>仅管理当前交互的提示音、点击音或反馈音；词汇发音与背景音乐应引用所属内容模块。</small></span></div><strong>{value.audioUrl ? '已关联' : '未关联'}</strong></header><div className="game-art-sound-fields"><label><span>触发时机</span><input value={value.trigger} maxLength={120} onChange={(event) => onChange({ ...value, trigger: event.target.value })} placeholder="例如：点击选项时" /></label><label><span>音量</span><input type="number" min="0" max="100" value={value.volume} onChange={(event) => onChange({ ...value, volume: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /><i>%</i></label></div>{value.audioUrl && <div className="game-art-sound-preview"><audio controls preload="metadata" src={value.audioUrl}>当前浏览器不支持音效试听。</audio><small>{value.originalName || value.resourceRef}</small><button type="button" className="button danger" onClick={() => void remove()}><Trash2 size={14} /> 移除音效</button></div>}{staticDemo ? <p className="pet-image-demo">在线演示版不支持音效上传，请在本地平台中管理音效素材。</p> : <div className="pet-image-upload"><label htmlFor={`game-art-sound-upload-${target.scope}-${target.gameId || 'shared'}-${target.assetId}`}><input id={`game-art-sound-upload-${target.scope}-${target.gameId || 'shared'}-${target.assetId}`} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,.mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={(event) => setFile(event.target.files?.[0] || null)} /><Volume2 size={18} /><span>{file ? file.name : '选择音效文件'}</span></label><button type="button" className="button primary" onClick={() => void upload()} disabled={uploading || !file}>{uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploading ? '正在上传…' : '上传并关联'}</button></div>}{error && <p className="game-art-detail-error">{error}</p>}</section>
}

function GameManagedArtAssetDialog({ projectId, staticDemo, game, asset, imageAssets, onUpload, onChange, onRemove, onClose }: { projectId: string; staticDemo: boolean; game: Game; asset: GameManagedArtAsset; imageAssets: ImageAsset[]; onUpload: (game: Game, asset: GameManagedArtAsset, files: File[]) => Promise<ImageAsset[]>; onChange: (value: GameManagedArtAsset) => void; onRemove: () => void; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const linkedAssets = imageAssets.filter((image) => asset.imageAssetIds.includes(image.id))
  const set = <K extends keyof GameManagedArtAsset>(key: K, value: GameManagedArtAsset[K]) => onChange({ ...asset, [key]: value })
  const attachImages = async () => {
    if (files.length === 0) return setError('请先选择至少一张图片或动图。')
    setUploading(true); setError('')
    try {
      const created = await onUpload(game, asset, files)
      const imageAssetIds = [...new Set([...asset.imageAssetIds, ...created.map((image) => image.id)])]
      const primaryImageAssetId = asset.primaryImageAssetId || created[0]?.id || ''
      onChange({ ...asset, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId })
      setFiles([])
      const input = document.getElementById(`game-managed-art-upload-${asset.id}`) as HTMLInputElement | null
      if (input) input.value = ''
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : '游戏美术素材上传失败。') } finally { setUploading(false) }
  }
  const choosePrimary = (assetId: string) => onChange({ ...asset, primaryImageAssetId: assetId, assetId })
  const removeReference = (assetId: string) => {
    const imageAssetIds = asset.imageAssetIds.filter((id) => id !== assetId)
    const primaryImageAssetId = asset.primaryImageAssetId === assetId ? imageAssetIds[0] || '' : asset.primaryImageAssetId
    onChange({ ...asset, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId })
  }
  return <div className="game-managed-art-backdrop" role="presentation"><section className="game-managed-art-dialog" role="dialog" aria-modal="true" aria-labelledby="game-managed-art-title"><header><div><span>GAME ART CONTENT SETUP</span><h3 id="game-managed-art-title">{asset.name || '新增美术内容'}</h3><p>静态图片始终归属当前游戏条目；仅按需开启动图或音效管理，色彩、材质、光照与禁止项继承项目主视觉设计。</p></div><button type="button" onClick={onClose} aria-label="关闭美术内容设定"><X size={18} /></button></header><div className="game-managed-art-dialog-body"><div className="game-managed-art-fields"><label><span>序号</span><input type="number" min="1" value={asset.order} onChange={(event) => set('order', Number(event.target.value) || 1)} /></label><label><span>素材名称 *</span><input value={asset.name} onChange={(event) => set('name', event.target.value)} /></label><label><span>状态／变体</span><input value={asset.variants} onChange={(event) => set('variants', event.target.value)} placeholder="默认／按下／动效" /></label><label><span>制作状态</span><select value={asset.status} onChange={(event) => set('status', event.target.value as GameStatus)}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="full"><span>素材说明 *</span><textarea rows={3} value={asset.description} onChange={(event) => set('description', event.target.value)} /></label><label className="full"><span>主视觉继承约束</span><p className="game-art-editor-note"><CircleAlert size={15} />此处不保存独立风格规则。上传、制作和审核均须遵循本项目主视觉；主视觉变更后需要重新复核。</p></label></div><GameArtMediaRequirements value={asset.mediaRequirements} onChange={(mediaRequirements) => set('mediaRequirements', mediaRequirements)} /><section className="game-managed-art-image-manager"><header><div><ImageIcon size={18} /><span><strong>静态图片预览与上传</strong><small>支持 PNG、JPG、WebP；上传后保存在当前项目的游戏美术 source 素材目录。</small></span></div><strong>{linkedAssets.length} 张</strong></header>{staticDemo ? <p className="pet-image-demo">在线演示版不支持文件上传；请在本地平台中管理游戏美术素材。</p> : <div className="pet-image-upload"><label htmlFor={`game-managed-art-upload-${asset.id}`}><input id={`game-managed-art-upload-${asset.id}`} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><ImagePlus size={18} /><span>{files.length ? `已选择 ${files.length} 张图片` : '选择静态图片'}</span></label><button type="button" className="button primary" onClick={() => void attachImages()} disabled={uploading || files.length === 0}>{uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploading ? '正在上传…' : '上传并关联'}</button></div>}{error && <p className="pet-image-error">{error}</p>}{linkedAssets.length === 0 ? <div className="pet-image-empty"><ImageIcon size={22} /> 尚未关联静态图片；上传后可在此选择卡片预览图。</div> : <div className="pet-image-grid">{linkedAssets.map((image) => <article className={image.id === asset.primaryImageAssetId ? 'is-primary' : ''} key={image.id}><img src={image.imageUrl} alt={image.name} /><div><strong>{image.name}</strong><small>{image.width}×{image.height}</small></div><footer><button type="button" onClick={() => choosePrimary(image.id)} disabled={image.id === asset.primaryImageAssetId}><Star size={13} fill={image.id === asset.primaryImageAssetId ? 'currentColor' : 'none'} />{image.id === asset.primaryImageAssetId ? '主预览图' : '设为主图'}</button><button type="button" onClick={() => removeReference(image.id)}><X size={13} /> 移除引用</button></footer></article>)}</div>}</section>{asset.mediaRequirements.animation && <GameArtDynamicImageManager assetId={asset.id} staticDemo={staticDemo} imageAssets={imageAssets} dynamicImageAssetIds={asset.dynamicImageAssetIds} onUpload={(dynamicFiles) => onUpload(game, asset, dynamicFiles)} onChange={(dynamicImageAssetIds) => set('dynamicImageAssetIds', dynamicImageAssetIds)} />}{asset.mediaRequirements.sound && <GameArtSoundEffectManager projectId={projectId} staticDemo={staticDemo} target={{ scope: 'managed', gameId: game.id, assetId: asset.id }} value={asset.soundEffect} onChange={(soundEffect) => set('soundEffect', soundEffect)} />}</div><footer><button type="button" className="button danger" onClick={onRemove}><Trash2 size={15} /> 删除美术内容</button><button type="button" className="button primary" onClick={onClose}><Check size={15} /> 完成设定</button></footer></section></div>
}

type GameArtAssetEditorProps = { projectId: string; staticDemo: boolean; imageAssets: ImageAsset[]; draft: { isNew: boolean; value: GameArtAsset }; saving: boolean; onUpload: (asset: GameArtAsset, files: File[]) => Promise<ImageAsset[]>; onChange: (value: GameArtAsset) => void; onCancel: () => void; onRemove: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }

function GameArtAssetEditor(props: GameArtAssetEditorProps) {
  const { draft, onChange } = props
  const translated = { ...draft.value, group: assetGroupCopy[draft.value.group], status: statusCopy[draft.value.status] } as unknown as GameArtAsset
  const handleChange = (value: GameArtAsset) => {
    const group = value.group === assetGroupCopy.common ? 'common' : 'clue-teaching'
    const status = (Object.entries(statusCopy) as Array<[GameStatus, string]>).find(([, label]) => label === value.status)?.[0] || 'planned'
    onChange({ ...value, group, status })
  }
  return <div className={`game-art-optional-media ${draft.value.mediaRequirements.animation ? '' : 'without-animation'}`}><GameArtMediaRequirements value={draft.value.mediaRequirements} onChange={(mediaRequirements) => onChange({ ...draft.value, mediaRequirements })} />{draft.value.mediaRequirements.animation && <GameArtDynamicImageManager assetId={draft.value.id} staticDemo={props.staticDemo} imageAssets={props.imageAssets} dynamicImageAssetIds={draft.value.dynamicImageAssetIds} onUpload={(files) => props.onUpload(draft.value, files)} onChange={(dynamicImageAssetIds) => onChange({ ...draft.value, dynamicImageAssetIds })} />}{draft.value.mediaRequirements.sound && <GameArtSoundEffectManager projectId={props.projectId} staticDemo={props.staticDemo} target={{ scope: 'global', assetId: draft.value.id }} value={draft.value.soundEffect} onChange={(soundEffect) => onChange({ ...draft.value, soundEffect })} />}<GameArtAssetDetailForm {...props} draft={{ ...draft, value: translated }} onChange={handleChange} /></div>
}

function GameArtAssetDetailForm({ projectId, staticDemo, imageAssets, draft, saving, onUpload, onChange, onCancel, onRemove, onSave }: GameArtAssetEditorProps) {
  const asset = draft.value
  const [files, setFiles] = useState<File[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [videoName, setVideoName] = useState('')
  const [videoFps, setVideoFps] = useState(12)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState('')
  const [directFrames, setDirectFrames] = useState<File[]>([])
  const [directName, setDirectName] = useState('')
  const [directFps, setDirectFps] = useState(12)
  const [sequences, setSequences] = useState<GameFrameSequence[]>([])
  const [loadingSequences, setLoadingSequences] = useState(!draft.isNew && !staticDemo)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingSequence, setUploadingSequence] = useState(false)
  const [error, setError] = useState('')
  const linkedAssets = imageAssets.filter((image) => asset.imageAssetIds.includes(image.id))
  const needsAnimation = asset.mediaRequirements?.animation === true
  const set = <K extends keyof GameArtAsset>(key: K, value: GameArtAsset[K]) => onChange({ ...asset, [key]: value })

  useEffect(() => {
    if (!needsAnimation || staticDemo || draft.isNew || !asset.id) { setSequences([]); setLoadingSequences(false); return }
    setLoadingSequences(true); setError('')
    void (async () => {
      try {
        const params = new URLSearchParams({ projectId, moduleId: 'game-content', gameArtAssetId: asset.id })
        const response = await fetch(`/api/frame-sequences?${params}`)
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '游戏动态素材读取失败。')
        setSequences(result)
      } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '游戏动态素材读取失败。') } finally { setLoadingSequences(false) }
    })()
  }, [asset.id, draft.isNew, needsAnimation, projectId, staticDemo])

  const attachImages = async () => {
    const allowedFiles = needsAnimation ? files : files.filter((file) => file.type !== 'image/gif')
    if (allowedFiles.length === 0) return setError(needsAnimation ? '请先选择至少一张图片或动图。' : '静态图片素材不接收 GIF；如确有动效需求，请先开启动态素材。')
    setUploadingImages(true); setError('')
    try {
      const created = await onUpload(asset, allowedFiles)
      const imageAssetIds = [...new Set([...asset.imageAssetIds, ...created.map((image) => image.id)])]
      const primaryImageAssetId = asset.primaryImageAssetId || created[0]?.id || ''
      onChange({ ...asset, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId })
      setFiles([])
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : '游戏美术图片上传失败。') } finally { setUploadingImages(false) }
  }
  const choosePrimary = (assetId: string) => onChange({ ...asset, primaryImageAssetId: assetId, assetId })
  const removeReference = (assetId: string) => {
    const imageAssetIds = asset.imageAssetIds.filter((id) => id !== assetId)
    const primaryImageAssetId = asset.primaryImageAssetId === assetId ? imageAssetIds[0] || '' : asset.primaryImageAssetId
    onChange({ ...asset, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId })
  }
  const createSequence = async (mode: 'video' | 'frames') => {
    if (!needsAnimation) return setError('请先开启动态素材管理，再上传序列帧。')
    if (draft.isNew || !asset.id) return setError('请先保存素材基本信息，再上传动态素材。')
    if (mode === 'video' && (!video || !videoName.trim())) return setError('请选择视频并填写动画名称。')
    if (mode === 'frames' && (directFrames.length === 0 || !directName.trim())) return setError('请选择 PNG 序列帧并填写动画名称。')
    setUploadingSequence(true); setError('')
    try {
      const formData = new FormData()
      formData.append('projectId', projectId); formData.append('moduleId', 'game-content'); formData.append('gameArtAssetId', asset.id)
      if (mode === 'video') {
        formData.append('video', video as File); formData.append('name', videoName.trim()); formData.append('fps', String(videoFps)); formData.append('startTime', String(startTime))
        if (endTime.trim()) formData.append('endTime', endTime)
      } else {
        directFrames.forEach((frame) => formData.append('frames', frame)); formData.append('name', directName.trim()); formData.append('fps', String(directFps))
      }
      const endpoint = mode === 'video' ? '/api/frame-sequences' : '/api/frame-sequences/upload-images'
      const response = await fetch(endpoint, { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '游戏动态素材保存失败。')
      setSequences((current) => [result, ...current])
      setVideo(null); setVideoName(''); setStartTime(0); setEndTime(''); setDirectFrames([]); setDirectName('')
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : '游戏动态素材保存失败。') } finally { setUploadingSequence(false) }
  }
  const removeSequence = async (sequence: GameFrameSequence) => {
    if (!window.confirm(`确定删除动态素材“${sequence.name}”吗？原视频或 PNG 序列帧将从项目中移除。`)) return
    setError('')
    try {
      const response = await fetch(`/api/frame-sequences/${sequence.id}?projectId=${projectId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '动态素材删除失败。')
      setSequences((current) => current.filter((item) => item.id !== sequence.id))
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : '动态素材删除失败。') }
  }

  return <form className="game-art-detail-editor" onSubmit={onSave} role="dialog" aria-modal="true" aria-labelledby="game-art-detail-title"><header><div><span>{draft.isNew ? 'NEW GAME ART ASSET' : 'GAME ART ASSET DETAIL'}</span><h2 id="game-art-detail-title">{draft.isNew ? `新增${assetGroupCopy[asset.group]}` : `编辑 ${asset.name}`}</h2><p>详情中集中查看该素材的图片、主预览图和动态素材；所有素材仍归属于当前游戏美术素材条目。</p></div><button type="button" onClick={onCancel} aria-label="关闭游戏美术素材详情"><X size={18} /></button></header><div className="game-art-detail-fields game-editor-grid"><label><span>素材分组 *</span><select value={asset.group} disabled={!draft.isNew} onChange={(event) => set('group', event.target.value as ArtAssetGroup)}>{Object.entries(assetGroupCopy).map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select></label><label><span>素材稳定 ID *</span><input value={asset.id} disabled={!draft.isNew} onChange={(event) => set('id', event.target.value)} placeholder="clue-card-panel" /></label><label><span>素材名称 *</span><input value={asset.name} onChange={(event) => set('name', event.target.value)} placeholder="线索卡面板" /></label><label><span>数量</span><input value={asset.quantity} onChange={(event) => set('quantity', event.target.value)} placeholder="每词 1 张" /></label><label><span>制作状态</span><select value={asset.status} onChange={(event) => set('status', event.target.value as GameStatus)}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select></label><label><span>状态／变体</span><input value={asset.variants} onChange={(event) => set('variants', event.target.value)} placeholder="默认／悬停／按下／正确" /></label><label className="full"><span>素材说明 *</span><textarea rows={3} value={asset.description} onChange={(event) => set('description', event.target.value)} placeholder="记录素材用途、视觉组成与交互表现；颜色、材质、光照和禁止项均继承主视觉。" /></label><label className="full"><span>主视觉继承约束</span><p className="game-art-editor-note"><CircleAlert size={15} />此处不保存独立的风格规则。制作、上传与审核时必须遵循页面上方的项目主视觉设计；主视觉变更后该素材需重新复核。</p></label></div><section className="game-art-detail-section"><header><div><ImageIcon size={18} /><span><strong>图片与动图素材</strong><small>上传 PNG、JPG、WebP 或 GIF；选择一张作为卡片主预览图。</small></span></div><strong>{linkedAssets.length} 张</strong></header>{staticDemo ? <p className="pet-image-demo">在线演示版不支持图片上传，请在本地平台中管理游戏美术素材。</p> : <div className="pet-image-upload"><label htmlFor={`game-art-image-upload-${asset.id}`}><input id={`game-art-image-upload-${asset.id}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><ImagePlus size={18} /><span>{files.length ? `已选择 ${files.length} 张图片` : '选择图片或动图素材'}</span></label><button type="button" className="button primary" onClick={() => void attachImages()} disabled={uploadingImages || files.length === 0}>{uploadingImages ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploadingImages ? '正在上传…' : '上传并关联'}</button></div>}{linkedAssets.length === 0 ? <div className="pet-image-empty"><ImageIcon size={22} /> 尚未关联图片或动图素材。</div> : <div className="pet-image-grid">{linkedAssets.map((image) => <article className={image.id === asset.primaryImageAssetId ? 'is-primary' : ''} key={image.id}><img src={image.imageUrl} alt={image.name} /><div><strong>{image.name}</strong><small>{image.width}×{image.height}</small></div><footer><button type="button" onClick={() => choosePrimary(image.id)} disabled={image.id === asset.primaryImageAssetId}><Star size={13} fill={image.id === asset.primaryImageAssetId ? 'currentColor' : 'none'} />{image.id === asset.primaryImageAssetId ? '主预览图' : '设为主图'}</button><button type="button" onClick={() => removeReference(image.id)}><X size={13} /> 移除引用</button></footer></article>)}</div>}</section><section className="game-art-detail-section game-art-animation-manager"><header><div><Film size={18} /><span><strong>动态素材</strong><small>支持视频转序列帧，或直接上传 PNG 序列帧；动态素材按当前素材 ID 独立保存。</small></span></div><strong>{loadingSequences ? '读取中' : `${sequences.length} 组`}</strong></header>{draft.isNew ? <p className="game-art-detail-note"><Film size={16} />保存素材基本信息后，重新打开详情即可上传动态素材。</p> : staticDemo ? <p className="pet-image-demo">在线演示版不支持动态素材上传，请在本地平台中管理游戏动态素材。</p> : <div className="game-art-animation-upload"><section><header><span>方式 01</span><strong>视频转序列帧</strong><small>支持 MP4、WebM、MOV、MKV、AVI。</small></header><label><span>视频文件</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi" onChange={(event) => setVideo(event.target.files?.[0] || null)} /></label><label><span>动画名称</span><input value={videoName} maxLength={60} onChange={(event) => setVideoName(event.target.value)} placeholder="例如：按钮闪烁" /></label><div><label><span>FPS</span><input type="number" min="1" max="60" value={videoFps} onChange={(event) => setVideoFps(Math.min(60, Math.max(1, Number(event.target.value) || 12)))} /></label><label><span>开始秒数</span><input type="number" min="0" step="0.1" value={startTime} onChange={(event) => setStartTime(Math.max(0, Number(event.target.value) || 0))} /></label><label><span>结束秒数</span><input value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="视频结尾" /></label></div><button type="button" className="button primary" onClick={() => void createSequence('video')} disabled={uploadingSequence}>{uploadingSequence ? <LoaderCircle className="spin" size={15} /> : <Film size={15} />}转序列帧并保存</button></section><section><header><span>方式 02</span><strong>直接上传序列帧</strong><small>按文件名顺序上传 PNG 帧，最多 2000 张。</small></header><label><span>PNG 序列帧</span><input type="file" accept="image/png,.png" multiple onChange={(event) => setDirectFrames(Array.from(event.target.files || []))} /></label><label><span>动画名称</span><input value={directName} maxLength={60} onChange={(event) => setDirectName(event.target.value)} placeholder="例如：按钮闪烁" /></label><label><span>播放 FPS</span><input type="number" min="1" max="60" value={directFps} onChange={(event) => setDirectFps(Math.min(60, Math.max(1, Number(event.target.value) || 12)))} /></label><button type="button" className="button primary" onClick={() => void createSequence('frames')} disabled={uploadingSequence}>{uploadingSequence ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}上传并保存序列帧</button></section></div>}{error && <p className="game-art-detail-error">{error}</p>}{loadingSequences ? <div className="game-art-sequence-empty"><LoaderCircle className="spin" size={18} /> 正在读取动态素材…</div> : sequences.length === 0 ? <div className="game-art-sequence-empty"><Film size={19} /> 尚未保存动态素材。</div> : <div className="game-art-sequence-grid">{sequences.map((sequence) => <GameFrameSequenceCard key={sequence.id} sequence={sequence} onDelete={() => void removeSequence(sequence)} />)}</div>}</section><footer>{!draft.isNew && <button type="button" className="button danger" onClick={onRemove}>删除素材</button>}<div><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存美术素材</button></div></footer></form>
}

function GameFrameSequenceCard({ sequence, onDelete }: { sequence: GameFrameSequence; onDelete: () => void }) {
  const [frame, setFrame] = useState(0)
  const frameCount = sequence.frameUrls.length
  useEffect(() => {
    if (frameCount <= 1) return
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frameCount), 1000 / Math.max(1, sequence.fps))
    return () => window.clearInterval(timer)
  }, [frameCount, sequence.fps])
  return <article className="game-art-sequence-card"><div className="game-art-sequence-stage" style={{ aspectRatio: sequence.width > 0 && sequence.height > 0 ? `${sequence.width} / ${sequence.height}` : '1 / 1' }}>{sequence.frameUrls[frame] ? <img src={sequence.frameUrls[frame]} alt={`${sequence.name}动态预览`} /> : <Film size={30} />}</div><div><strong>{sequence.name}</strong><small>{sequence.frameCount} 帧 · {sequence.fps} FPS · {sequence.width}×{sequence.height}px · {sequence.duration.toFixed(2)} 秒</small><span>{sequence.sourceType === 'video-to-frames' ? '视频转序列帧' : 'PNG 序列帧'}</span></div><footer><button type="button" onClick={() => setFrame(0)}><RotateCcw size={13} /> 从头</button><button type="button" onClick={onDelete}><Trash2 size={13} /> 删除</button></footer></article>
}
