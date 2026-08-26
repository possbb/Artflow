import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ClipboardList, Film, Image as ImageIcon, ImagePlus, LoaderCircle, MapPinned, Palette, Pause, PawPrint, PencilLine, Play, Plus, RotateCcw, Save, SlidersHorizontal, Star, Trash2, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ArtModule } from './data/modules'

type PetRarity = 'common' | 'rare'
type PetStatus = 'planned' | 'in_progress' | 'ready'
type ImageAsset = { id: string; name: string; originalName: string; imageUrl: string; width: number; height: number; status: string }
type Pet = { id: string; spanishName: string; chineseName: string; rarity: PetRarity; designSource: string; appearanceDesign: string; idleAnimationParameters?: AnimationParameters; description?: string; assetId: string; imageAssetIds: string[]; primaryImageAssetId: string; status: PetStatus; updatedAt: string }
type PetContent = { schemaVersion: number; projectId: string; updatedAt: string; pets: Pet[] }
type AnimationParameters = { model: string; duration: string; aspectRatio: string; referenceImage: string; actionContent: string; style: string; background: string; dialogueAudio: string; prohibitions: string }
type AnimationSourceType = 'video-to-frames' | 'uploaded-png-sequence' | 'preset-idle'
type PetFrameSequence = { id: string; name: string; createdAt: string; sourceType?: AnimationSourceType; sourceOriginalName: string; outputDirectory: string; fps: number; width: number; height: number; frameCount: number; duration: number; frameUrls: string[]; animationParameters: AnimationParameters }
type PetAnimationAction = PetFrameSequence & { isPreset?: boolean; previewImageUrl?: string }

const rarityCopy: Record<PetRarity, string> = { common: '普通', rare: '稀有' }
const statusCopy: Record<PetStatus, string> = { planned: '待制作', in_progress: '制作中', ready: '已就绪' }
const defaultAnimationParameters = (): AnimationParameters => ({ model: 'seedance_2.0_fast（默认）', duration: '5 秒（循环待机）', aspectRatio: '1:1（适合宠物展示，角色居中）', referenceImage: '', actionContent: '', style: '', background: '简洁暖米色中性背景，无场景元素', dialogueAudio: '无，纯动画 + 环境音', prohibitions: '文字/水印、照片写实、攻击性动作、角色身份漂移、镜头旋转' })
const defaultIdleAnimationParameters = (): AnimationParameters => ({ ...defaultAnimationParameters(), actionContent: '温和呼吸起伏 → 缓慢眨眼 → 轻微摆尾或局部装饰摆动 → 回到起始姿态，循环流畅无跳变。', style: '继承项目主视觉的材质、左上主光、柔和环境光与干净接地阴影。' })
const idleActionTemplate = (pet: Pet, previewImageUrl?: string): PetAnimationAction => ({ id: `preset-idle-${pet.id}`, name: '待机', createdAt: '', sourceType: 'preset-idle', sourceOriginalName: '项目预制待机动作模板', outputDirectory: '', fps: 12, width: 1, height: 1, frameCount: 0, duration: 5, frameUrls: [], animationParameters: { ...defaultIdleAnimationParameters(), ...pet.idleAnimationParameters, referenceImage: pet.idleAnimationParameters?.referenceImage || pet.primaryImageAssetId || '' }, isPreset: true, previewImageUrl })

function emptyContent(projectId: string): PetContent { return { schemaVersion: 1, projectId, updatedAt: '', pets: [] } }
function blankPet(): Pet { return { id: `pet_${Date.now()}`, spanishName: '', chineseName: '', rarity: 'common', designSource: '', appearanceDesign: '', idleAnimationParameters: defaultIdleAnimationParameters(), assetId: '', imageAssetIds: [], primaryImageAssetId: '', status: 'planned', updatedAt: '' } }

export function PetContentPage({ projectId, staticDemo, mainVisualModule }: { projectId: string; staticDemo: boolean; mainVisualModule?: ArtModule }) {
  const [content, setContent] = useState<PetContent | null>(null)
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [draft, setDraft] = useState<{ isNew: boolean; value: Pet } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    void (async () => {
      setContent(null); setDraft(null); setMessage(null)
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:pet-content:${projectId}:v1`)
          const parsed = stored ? JSON.parse(stored) as PetContent : emptyContent(projectId)
          setContent({ ...parsed, pets: parsed.pets.map((pet) => ({ ...pet, designSource: pet.designSource || pet.description || '', appearanceDesign: pet.appearanceDesign || '', idleAnimationParameters: { ...defaultIdleAnimationParameters(), ...pet.idleAnimationParameters }, imageAssetIds: Array.isArray(pet.imageAssetIds) ? pet.imageAssetIds : [], primaryImageAssetId: pet.primaryImageAssetId || pet.assetId || '', assetId: pet.primaryImageAssetId || pet.assetId || '' })) })
          setAssets([])
        } else {
          const [petResponse, assetResponse] = await Promise.all([
            fetch(`/api/projects/${projectId}/pet-content`),
            fetch(`/api/image-assets?${new URLSearchParams({ projectId, moduleId: 'pet-content' })}`),
          ])
          const [petResult, assetResult] = await Promise.all([petResponse.json(), assetResponse.json()])
          if (!petResponse.ok) throw new Error(petResult.error || '宠物内容读取失败。')
          if (!assetResponse.ok) throw new Error(assetResult.error || '宠物形象素材读取失败。')
          setContent({ ...petResult, pets: petResult.pets.map((pet: Pet) => ({ ...pet, designSource: pet.designSource || pet.description || '', appearanceDesign: pet.appearanceDesign || '', idleAnimationParameters: { ...defaultIdleAnimationParameters(), ...pet.idleAnimationParameters }, imageAssetIds: Array.isArray(pet.imageAssetIds) ? pet.imageAssetIds : [], primaryImageAssetId: pet.primaryImageAssetId || pet.assetId || '', assetId: pet.primaryImageAssetId || pet.assetId || '' })) })
          setAssets(assetResult)
        }
      } catch (error) {
        setContent(null)
        setMessage({ type: 'error', text: error instanceof Error ? error.message : '宠物内容读取失败。' })
      }
    })()
  }, [projectId, staticDemo])

  useEffect(() => {
    if (!draft) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [draft])

  const uploadPetImages = async (files: File[]) => {
    if (staticDemo) throw new Error('在线演示版不支持文件上传，请在本地平台中管理宠物形象素材。')
    const formData = new FormData()
    files.forEach((file) => formData.append('images', file))
    formData.append('projectId', projectId)
    formData.append('moduleId', 'pet-content')
    formData.append('name', draft?.value.chineseName.trim() || files[0]?.name.replace(/\.[^.]+$/, '') || '宠物形象')
    const response = await fetch('/api/image-assets', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '宠物形象上传失败。')
    setAssets((current) => [...result, ...current])
    return result as ImageAsset[]
  }

  const persist = async (nextContent: PetContent, success: string) => {
    setSaving(true); setMessage(null)
    try {
      const value = { ...nextContent, updatedAt: new Date().toISOString() }
      if (staticDemo) {
        window.localStorage.setItem(`artflow:pet-content:${projectId}:v1`, JSON.stringify(value))
        setContent(value)
      } else {
        const response = await fetch(`/api/projects/${projectId}/pet-content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: value }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '宠物内容保存失败。')
        setContent(result.content)
      }
      setDraft(null); setMessage({ type: 'success', text: success })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '宠物内容保存失败。' })
    } finally { setSaving(false) }
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content || !draft) return
    const pet = { ...draft.value, id: draft.value.id.trim(), spanishName: draft.value.spanishName.trim(), chineseName: draft.value.chineseName.trim() }
    if (!pet.id || !pet.spanishName || !pet.chineseName) return setMessage({ type: 'error', text: '请填写稳定 ID、西语名和中文名。' })
    if (pet.status === 'ready' && pet.imageAssetIds.length === 0) return setMessage({ type: 'error', text: '宠物标为“已就绪”前，至少需要关联一张设计形象图。' })
    const pets = draft.isNew ? [...content.pets, pet] : content.pets.map((item) => item.id === pet.id ? pet : item)
    void persist({ ...content, pets }, draft.isNew ? `已新增宠物“${pet.chineseName}”。` : `已更新宠物“${pet.chineseName}”。`)
  }

  const remove = (pet: Pet) => {
    if (!content || !window.confirm(`确定删除宠物内容“${pet.chineseName}”吗？已引用它的城市条目会保留引用并提示待修复。`)) return
    void persist({ ...content, pets: content.pets.filter((item) => item.id !== pet.id) }, `已删除宠物“${pet.chineseName}”。`)
  }

  if (!content) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取宠物内容…</div>
  return <div className="pet-content-page page-enter">
    <section className="pet-content-hero">
      <div><span className="section-kicker"><PawPrint size={14} /> PET CONTENT CATALOG</span><h1>宠物内容管理</h1><p>为项目维护宠物的唯一内容定义：名称、稀有度、设计来源、外观设定、制作状态和素材关联。宠物形象必须继承项目主视觉设计；城市内容管理只引用这里的宠物 ID，并配置该宠物在城市中的奖励位置。</p></div>
      <div><Link className="button ghost" to="/city-content-management"><MapPinned size={16} /> 查看城市引用</Link></div>
    </section>
    {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}
    <PetMainVisualAuthority mainVisualModule={mainVisualModule} />
    {draft && createPortal(<div className="pet-editor-backdrop" role="presentation"><PetEditor projectId={projectId} staticDemo={staticDemo} draft={draft} assets={assets} saving={saving} onUpload={uploadPetImages} onChange={(value) => setDraft({ ...draft, value })} onCancel={() => setDraft(null)} onSave={save} /></div>, document.body)}
    <section className="pet-catalog-section">
      <header><div><span className="eyebrow"><span /> PROJECT PET CONTENT</span><h2>宠物目录</h2></div><div className="pet-catalog-actions"><strong>{content.pets.length} 只宠物</strong><button className="button primary" onClick={() => setDraft({ isNew: true, value: blankPet() })}><Plus size={16} /> 新增宠物</button></div></header>
      {content.pets.length === 0 ? <div className="pet-empty"><PawPrint size={31} /><strong>还没有宠物内容</strong><p>先建立宠物定义并上传设计形象，再在城市内容管理中引用它作为奖励。</p><button className="button primary" onClick={() => setDraft({ isNew: true, value: blankPet() })}><Plus size={16} /> 新增第一只宠物</button></div> : <div className="pet-card-grid">{content.pets.map((pet) => <PetCard key={pet.id} pet={pet} asset={assets.find((asset) => asset.id === pet.primaryImageAssetId)} onEdit={() => setDraft({ isNew: false, value: { ...pet, imageAssetIds: [...pet.imageAssetIds] } })} onRemove={() => remove(pet)} removing={saving} />)}</div>}
    </section>
    <section className="pet-reference-note"><ClipboardList size={19} /><div><strong>引用约定</strong><p>城市内容管理中的宠物条目只保存宠物内容 ID、奖励宝箱和城市内状态；宠物名称、稀有度、设计来源、外观设定和素材均以本页为唯一来源。</p></div></section>
  </div>
}

function PetMainVisualAuthority({ mainVisualModule }: { mainVisualModule?: ArtModule }) {
  if (!mainVisualModule) return <section className="pet-visual-authority is-missing"><Palette size={20} /><div><strong>未找到主视觉设计要求</strong><p>请先建立主视觉设计；宠物形象暂时无法获得项目级色彩、材质、光照与镜头约束。</p></div><Link className="button ghost" to="/modules/main-visual-design/requirements">前往主视觉设计 <ArrowRight size={15} /></Link></section>
  return <section className="pet-visual-authority">
    <header><div><Palette size={20} /><span><small>INHERITED ART DIRECTION · READ ONLY</small><strong>宠物形象继承项目主视觉设计</strong><p>宠物不保存独立的风格副本。上传、筛选与确认形象时，必须以此处当前规则为准；主视觉变更会使已入库的宠物形象进入复核。</p></span></div><Link className="button ghost" to="/modules/main-visual-design/requirements">查看并编辑主视觉 <ArrowRight size={15} /></Link></header>
    <div className="pet-visual-rules">{mainVisualModule.sections.map((section) => <article key={section.id}><small>{section.label}</small><h3>{section.title}</h3><p>{section.description}</p><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div>
  </section>
}

function PetEditor({ projectId, staticDemo, draft, assets, saving, onUpload, onChange, onCancel, onSave }: { projectId: string; staticDemo: boolean; draft: { isNew: boolean; value: Pet }; assets: ImageAsset[]; saving: boolean; onUpload: (files: File[]) => Promise<ImageAsset[]>; onChange: (value: Pet) => void; onCancel: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const pet = draft.value
  const linkedAssets = assets.filter((asset) => pet.imageAssetIds.includes(asset.id))
  const set = <K extends keyof Pet>(key: K, value: Pet[K]) => onChange({ ...pet, [key]: value })
  const attachImages = async () => {
    if (files.length === 0) return setUploadError('请先选择至少一张宠物形象图片。')
    setUploading(true); setUploadError('')
    try {
      const created = await onUpload(files)
      const imageAssetIds = [...new Set([...pet.imageAssetIds, ...created.map((asset) => asset.id)])]
      const primaryImageAssetId = pet.primaryImageAssetId || created[0]?.id || ''
      onChange({ ...pet, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId })
      setFiles([])
      const input = document.getElementById('pet-image-upload') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (error) { setUploadError(error instanceof Error ? error.message : '宠物形象上传失败。') } finally { setUploading(false) }
  }
  const choosePrimary = (assetId: string) => onChange({ ...pet, primaryImageAssetId: assetId, assetId })
  const removeReference = (assetId: string) => {
    const imageAssetIds = pet.imageAssetIds.filter((id) => id !== assetId)
    const primaryImageAssetId = pet.primaryImageAssetId === assetId ? imageAssetIds[0] || '' : pet.primaryImageAssetId
    onChange({ ...pet, imageAssetIds, primaryImageAssetId, assetId: primaryImageAssetId })
  }
  return <form className="pet-editor" onSubmit={onSave} role="dialog" aria-modal="true" aria-labelledby="pet-editor-title"><header><div><span>{draft.isNew ? 'NEW PET' : 'EDIT PET'}</span><h2 id="pet-editor-title">{draft.isNew ? '新增宠物内容' : `编辑 ${pet.chineseName}`}</h2></div><button type="button" onClick={onCancel} aria-label="关闭宠物编辑"><X size={18} /></button></header><div className="pet-editor-grid"><label><span>宠物内容 ID *</span><input value={pet.id} disabled={!draft.isNew} onChange={(event) => set('id', event.target.value)} placeholder="pet_barcelona_cat" /></label><label><span>西语名称 *</span><input value={pet.spanishName} onChange={(event) => set('spanishName', event.target.value)} placeholder="Gato de Barcelona" /></label><label><span>中文名称 *</span><input value={pet.chineseName} onChange={(event) => set('chineseName', event.target.value)} placeholder="巴塞罗那小猫" /></label><label><span>稀有度</span><select value={pet.rarity} onChange={(event) => set('rarity', event.target.value as PetRarity)}>{Object.entries(rarityCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>制作状态</span><select value={pet.status} onChange={(event) => set('status', event.target.value as PetStatus)}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="full"><span>设计来源</span><textarea rows={3} value={pet.designSource} onChange={(event) => set('designSource', event.target.value)} placeholder="记录原型、文化出处、玩法奖励定位或设计灵感来源。" /></label><label className="full"><span>外观设定</span><textarea rows={3} value={pet.appearanceDesign} onChange={(event) => set('appearanceDesign', event.target.value)} placeholder="记录体型、轮廓、配色、材质、表情、动作及与主视觉一致的外观约束。" /></label></div>
    <section className="pet-image-manager"><header><div><ImageIcon size={18} /><span><strong>宠物形象素材</strong><small>上传的图片保存到当前项目的 source 素材目录；形象的色彩、材质、光照、镜头与禁止项继承上方主视觉要求；选择一张作为宠物卡片主预览。</small></span></div><strong>{linkedAssets.length} 张</strong></header>{staticDemo ? <p className="pet-image-demo">在线演示版不支持文件上传；请在本地平台中管理宠物形象素材。</p> : <div className="pet-image-upload"><label htmlFor="pet-image-upload"><input id="pet-image-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><ImagePlus size={18} /><span>{files.length ? `已选择 ${files.length} 张图片` : '选择宠物形象图片'}</span></label><button type="button" className="button primary" onClick={() => void attachImages()} disabled={uploading || files.length === 0}>{uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploading ? '正在上传…' : '上传并关联'}</button></div>}{uploadError && <p className="pet-image-error">{uploadError}</p>}{linkedAssets.length === 0 ? <div className="pet-image-empty"><PawPrint size={22} /> 尚未关联宠物形象；上传后可在此选择主预览图。</div> : <div className="pet-image-grid">{linkedAssets.map((asset) => <article className={asset.id === pet.primaryImageAssetId ? 'is-primary' : ''} key={asset.id}><img src={asset.imageUrl} alt={asset.name} /><div><strong>{asset.name}</strong><small>{asset.width}×{asset.height}</small></div><footer><button type="button" onClick={() => choosePrimary(asset.id)} disabled={asset.id === pet.primaryImageAssetId}><Star size={13} fill={asset.id === pet.primaryImageAssetId ? 'currentColor' : 'none'} />{asset.id === pet.primaryImageAssetId ? '主预览图' : '设为主图'}</button><button type="button" onClick={() => removeReference(asset.id)}><X size={13} /> 移除引用</button></footer></article>)}</div>}</section>
    {draft.isNew ? <section className="pet-animation-manager pet-animation-note"><Film size={18} /><div><strong>宠物序列帧动画</strong><p>先保存宠物内容，再上传动作视频并将 PNG 序列帧关联到这只宠物。</p></div></section> : <PetAnimationLibrary projectId={projectId} pet={pet} previewImageUrl={linkedAssets.find((asset) => asset.id === pet.primaryImageAssetId)?.imageUrl} staticDemo={staticDemo} onIdleParametersChange={(idleAnimationParameters) => onChange({ ...pet, idleAnimationParameters })} />}
    <footer><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存宠物内容</button></footer></form>
}

/* Replaced inline implementation retained only during source migration.
function PetAnimationLibrary({ projectId, pet, previewImageUrl, staticDemo, onIdleParametersChange }: { projectId: string; pet: Pet; previewImageUrl?: string; staticDemo: boolean; onIdleParametersChange: (value: AnimationParameters) => void }) {
  const [sequences, setSequences] = useState<PetFrameSequence[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [fps, setFps] = useState(12)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState('')
  const [directFrames, setDirectFrames] = useState<File[]>([])
  const [directName, setDirectName] = useState('')
  const [directFps, setDirectFps] = useState(12)
  const [uploadingFrames, setUploadingFrames] = useState(false)
  const [loading, setLoading] = useState(!staticDemo)
  const [creating, setCreating] = useState(false)
  const [detailSequence, setDetailSequence] = useState<PetAnimationAction | null>(null)
  const [error, setError] = useState('')
  const [parameterDraft, setParameterDraft] = useState<{ sequence: PetFrameSequence; value: AnimationParameters } | null>(null)
  const [savingParameters, setSavingParameters] = useState(false)

  const loadSequences = async () => {
    if (staticDemo) return
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/frame-sequences?${new URLSearchParams({ projectId, moduleId: 'pet-content', petId: pet.id })}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '无法读取宠物序列帧。')
      setSequences(result)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '无法读取宠物序列帧。') } finally { setLoading(false) }
  }

  useEffect(() => { void loadSequences() }, [projectId, pet.id, staticDemo])

  const createSequence = async () => {
    if (!file) return setError('请选择一个宠物动作视频。')
    if (!name.trim()) return setError('请填写动画名称。')
    if (startTime < 0) return setError('开始时间不能小于 0。')
    if (endTime.trim() && Number(endTime) <= startTime) return setError('结束时间必须晚于开始时间。')
    setCreating(true); setError('')
    try {
      const formData = new FormData()
      formData.append('video', file)
      formData.append('projectId', projectId)
      formData.append('moduleId', 'pet-content')
      formData.append('petId', pet.id)
      formData.append('name', name.trim())
      formData.append('fps', String(fps))
      formData.append('startTime', String(startTime))
      if (endTime.trim()) formData.append('endTime', endTime)
      const response = await fetch('/api/frame-sequences', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '宠物序列帧制作失败。')
      setSequences((current) => [result, ...current]); setDetailSequence(result)
      setPlayingId(result.id)
      setFile(null); setName(''); setStartTime(0); setEndTime('')
      const input = document.getElementById(`pet-sequence-video-${pet.id}`) as HTMLInputElement | null
      if (input) input.value = ''
    } catch (createError) { setError(createError instanceof Error ? createError.message : '宠物序列帧制作失败。') } finally { setCreating(false) }
  }

  const uploadFrames = async () => {
    if (directFrames.length === 0) return setError('请选择至少一张 PNG 序列帧。')
    if (!directName.trim()) return setError('请填写直接上传序列的动画名称。')
    setUploadingFrames(true); setError('')
    try {
      const formData = new FormData()
      directFrames.forEach((frame) => formData.append('frames', frame))
      formData.append('projectId', projectId)
      formData.append('moduleId', 'pet-content')
      formData.append('petId', pet.id)
      formData.append('name', directName.trim())
      formData.append('fps', String(directFps))
      const response = await fetch('/api/frame-sequences/upload-images', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'PNG 序列帧上传失败。')
      setSequences((current) => [result, ...current]); setDetailSequence(result)
      setPlayingId(result.id)
      setDirectFrames([]); setDirectName('')
      const input = document.getElementById(`pet-sequence-frames-${pet.id}`) as HTMLInputElement | null
      if (input) input.value = ''
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'PNG 序列帧上传失败。') } finally { setUploadingFrames(false) }
  }

  const removeSequence = async (sequence: PetFrameSequence) => {
    if (!window.confirm(`确定删除宠物动画“${sequence.name}”吗？原视频、PNG 帧和 manifest 都会从项目中移除。`)) return
    setError('')
    try {
      const response = await fetch(`/api/frame-sequences/${sequence.id}?projectId=${projectId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '删除宠物动画失败。')
      setSequences((current) => current.filter((item) => item.id !== sequence.id))
      setPlayingId((current) => current === sequence.id ? null : current)
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : '删除宠物动画失败。') }
  }

  const saveParameters = async () => {
    if (!parameterDraft) return
    setSavingParameters(true); setError('')
    try {
      if (parameterDraft.sequence.isPreset) {
        onIdleParametersChange(parameterDraft.value)
        setDetailSequence((current) => current?.isPreset ? { ...current, animationParameters: parameterDraft.value } : current)
        setParameterDraft(null)
        return
      }
      const response = await fetch(`/api/frame-sequences/${parameterDraft.sequence.id}/parameters`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, animationParameters: parameterDraft.value }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '动态素材参数保存失败。')
      setSequences((current) => current.map((sequence) => sequence.id === result.id ? result : sequence))
      setParameterDraft(null)
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '动态素材参数保存失败。') } finally { setSavingParameters(false) }
  }

  return <>
  <section className="pet-animation-manager">
    <header><div><Film size={18} /><span><strong>动态素材</strong><small>动画文件以宠物 ID 独立保存；可由视频转换，或直接上传现有 PNG 序列帧。</small></span></div><strong>{sequences.length} 组</strong></header>
    {staticDemo ? <p className="pet-image-demo">在线演示版不支持动态素材上传；请在本地平台中管理宠物序列帧。</p> : <div className="pet-animation-methods"><section><header><span>方式 01</span><strong>视频转序列帧</strong><small>上传 MP4、WebM、MOV、MKV 或 AVI，按时间范围提取 PNG。</small></header><div className="pet-animation-upload"><label htmlFor={`pet-sequence-video-${pet.id}`}><input id={`pet-sequence-video-${pet.id}`} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi" onChange={(event) => setFile(event.target.files?.[0] || null)} /><Upload size={16} /><span>{file ? file.name : '选择宠物动作视频'}</span></label><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="动画名称，例如：小猫待机" /><label className="pet-animation-number"><span>采样帧率</span><input type="number" min="1" max="60" value={fps} onChange={(event) => setFps(Math.min(60, Math.max(1, Number(event.target.value) || 12)))} /><i>FPS</i></label><label className="pet-animation-number"><span>开始时间</span><input type="number" min="0" step="0.1" value={startTime} onChange={(event) => setStartTime(Math.max(0, Number(event.target.value) || 0))} /><i>秒</i></label><label className="pet-animation-number"><span>结束时间</span><input type="number" min="0" step="0.1" value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="视频结尾" /><i>秒</i></label><button type="button" className="button primary" onClick={() => void createSequence()} disabled={creating}>{creating ? <LoaderCircle className="spin" size={15} /> : <Film size={15} />}{creating ? '正在提取…' : '转序列帧并保存'}</button></div></section><section><header><span>方式 02</span><strong>直接上传序列帧</strong><small>上传按文件名排序的 PNG 帧（最多 2000 张），并设置播放帧率。</small></header><div className="pet-animation-upload pet-frame-upload"><label htmlFor={`pet-sequence-frames-${pet.id}`}><input id={`pet-sequence-frames-${pet.id}`} type="file" accept="image/png,.png" multiple onChange={(event) => setDirectFrames(Array.from(event.target.files || []))} /><Upload size={16} /><span>{directFrames.length ? `已选择 ${directFrames.length} 张 PNG` : '选择 PNG 序列帧'}</span></label><input value={directName} maxLength={60} onChange={(event) => setDirectName(event.target.value)} placeholder="动画名称，例如：小猫挥手" /><label className="pet-animation-number"><span>播放帧率</span><input type="number" min="1" max="60" value={directFps} onChange={(event) => setDirectFps(Math.min(60, Math.max(1, Number(event.target.value) || 12))} /><i>FPS</i></label><button type="button" className="button primary" onClick={() => void uploadFrames()} disabled={uploadingFrames}>{uploadingFrames ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploadingFrames ? '正在保存…' : '上传并保存序列帧'}</button></div></section></div>}
    {error && <p className="pet-image-error">{error}</p>}
    {loading ? <div className="pet-animation-empty"><LoaderCircle className="spin" size={18} /> 正在读取宠物动画…</div> : sequences.length === 0 ? <div className="pet-animation-empty"><Film size={19} /> 尚未保存宠物序列帧动画。</div> : <div className="pet-animation-list">{sequences.map((sequence) => <PetSequenceCard key={sequence.id} sequence={sequence} isPlaying={playingId === sequence.id} onPlay={() => setPlayingId(sequence.id)} onPause={() => setPlayingId(null)} onConfigure={() => setParameterDraft({ sequence, value: { ...defaultAnimationParameters(), ...sequence.animationParameters } })} onDelete={() => void removeSequence(sequence)} />)}</div>}
  </section>
  {parameterDraft && createPortal(<PetAnimationParametersDialog sequence={parameterDraft.sequence} value={parameterDraft.value} saving={savingParameters} onChange={(value) => setParameterDraft({ ...parameterDraft, value })} onCancel={() => setParameterDraft(null)} onSave={() => void saveParameters()} />, document.body)}
  </>
}
*/

function PetAnimationLibrary({ projectId, pet, previewImageUrl, staticDemo, onIdleParametersChange }: { projectId: string; pet: Pet; previewImageUrl?: string; staticDemo: boolean; onIdleParametersChange: (value: AnimationParameters) => void }) {
  const [sequences, setSequences] = useState<PetFrameSequence[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [videoName, setVideoName] = useState('')
  const [fps, setFps] = useState(12)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState('')
  const [directFrames, setDirectFrames] = useState<File[]>([])
  const [directName, setDirectName] = useState('')
  const [directFps, setDirectFps] = useState(12)
  const [loading, setLoading] = useState(!staticDemo)
  const [creating, setCreating] = useState(false)
  const [uploadingFrames, setUploadingFrames] = useState(false)
  const [detailSequence, setDetailSequence] = useState<PetAnimationAction | null>(null)
  const [error, setError] = useState('')
  const [parameterDraft, setParameterDraft] = useState<{ sequence: PetFrameSequence; value: AnimationParameters } | null>(null)
  const [savingParameters, setSavingParameters] = useState(false)

  const loadSequences = async () => {
    if (staticDemo) return
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/frame-sequences?${new URLSearchParams({ projectId, moduleId: 'pet-content', petId: pet.id })}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '无法读取宠物序列帧。')
      setSequences(result)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '无法读取宠物序列帧。') } finally { setLoading(false) }
  }

  useEffect(() => { void loadSequences() }, [projectId, pet.id, staticDemo])

  const createFromVideo = async () => {
    if (!video) return setError('请选择一个宠物动作视频。')
    if (!videoName.trim()) return setError('请填写动画名称。')
    if (endTime.trim() && Number(endTime) <= startTime) return setError('结束时间必须晚于开始时间。')
    setCreating(true); setError('')
    try {
      const formData = new FormData()
      formData.append('video', video)
      formData.append('projectId', projectId)
      formData.append('moduleId', 'pet-content')
      formData.append('petId', pet.id)
      formData.append('name', videoName.trim())
      formData.append('fps', String(fps))
      formData.append('startTime', String(startTime))
      if (endTime.trim()) formData.append('endTime', endTime)
      const response = await fetch('/api/frame-sequences', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '宠物序列帧制作失败。')
      setSequences((current) => [result, ...current]); setDetailSequence(result)
      setVideo(null); setVideoName(''); setStartTime(0); setEndTime('')
      const input = document.getElementById(`pet-sequence-video-${pet.id}`) as HTMLInputElement | null
      if (input) input.value = ''
    } catch (createError) { setError(createError instanceof Error ? createError.message : '宠物序列帧制作失败。') } finally { setCreating(false) }
  }

  const uploadFrames = async () => {
    if (directFrames.length === 0) return setError('请选择至少一张 PNG 序列帧。')
    if (!directName.trim()) return setError('请填写直接上传序列的动画名称。')
    setUploadingFrames(true); setError('')
    try {
      const formData = new FormData()
      directFrames.forEach((frame) => formData.append('frames', frame))
      formData.append('projectId', projectId)
      formData.append('moduleId', 'pet-content')
      formData.append('petId', pet.id)
      formData.append('name', directName.trim())
      formData.append('fps', String(directFps))
      const response = await fetch('/api/frame-sequences/upload-images', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'PNG 序列帧上传失败。')
      setSequences((current) => [result, ...current]); setDetailSequence(result)
      setDirectFrames([]); setDirectName('')
      const input = document.getElementById(`pet-sequence-frames-${pet.id}`) as HTMLInputElement | null
      if (input) input.value = ''
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'PNG 序列帧上传失败。') } finally { setUploadingFrames(false) }
  }

  const removeSequence = async (sequence: PetFrameSequence) => {
    if (!window.confirm(`确定删除宠物动画“${sequence.name}”吗？原视频、PNG 帧和 manifest 都会从项目中移除。`)) return
    setError('')
    try {
      const response = await fetch(`/api/frame-sequences/${sequence.id}?projectId=${projectId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '删除宠物动画失败。')
      setSequences((current) => current.filter((item) => item.id !== sequence.id))
      setDetailSequence((current) => current?.id === sequence.id ? null : current)
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : '删除宠物动画失败。') }
  }

  const saveParameters = async () => {
    if (!parameterDraft) return
    setSavingParameters(true); setError('')
    try {
      const response = await fetch(`/api/frame-sequences/${parameterDraft.sequence.id}/parameters`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, animationParameters: parameterDraft.value }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '动态素材参数保存失败。')
      setSequences((current) => current.map((sequence) => sequence.id === result.id ? result : sequence))
      setDetailSequence((current) => current?.id === result.id ? result : current)
      setParameterDraft(null)
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '动态素材参数保存失败。') } finally { setSavingParameters(false) }
  }

  const NumberField = ({ label, value, onChange, placeholder, unit = 'FPS' }: { label: string; value: number | string; onChange: (value: string) => void; placeholder?: string; unit?: string }) => <label className="pet-animation-number"><span>{label}</span><input type="number" min="0" step="0.1" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><i>{unit}</i></label>
  const actions: PetAnimationAction[] = sequences.some((sequence) => sequence.name.includes('待机')) ? sequences : [idleActionTemplate(pet, previewImageUrl), ...sequences]
  const importPanel: ReactNode = staticDemo ? <p className="pet-image-demo">在线演示版不支持动态素材上传；请在本地平台中管理宠物序列帧。</p> : <section className="pet-sequence-import-panel"><header><strong>制作序列帧</strong><small>为当前动作选择一种制作方式；保存时使用动作名称关联正式序列帧。</small></header><div className="pet-animation-methods"><section><header><span>方式 01</span><strong>视频转序列帧</strong><small>上传 MP4、WebM、MOV、MKV 或 AVI，按时间范围提取 PNG。</small></header><div className="pet-animation-upload"><label htmlFor={`pet-sequence-video-${pet.id}`}><input id={`pet-sequence-video-${pet.id}`} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi" onChange={(event) => setVideo(event.target.files?.[0] || null)} /><Upload size={16} /><span>{video ? video.name : '选择宠物动作视频'}</span></label><input value={videoName} maxLength={60} onChange={(event) => setVideoName(event.target.value)} placeholder="动作名称，例如：待机" /><NumberField label="采样帧率" value={fps} onChange={(value) => setFps(Math.min(60, Math.max(1, Number(value) || 12)))} /><NumberField label="开始时间" unit="秒" value={startTime} onChange={(value) => setStartTime(Math.max(0, Number(value) || 0))} /><NumberField label="结束时间" unit="秒" value={endTime} onChange={setEndTime} placeholder="视频结尾" /><button type="button" className="button primary" onClick={() => void createFromVideo()} disabled={creating}>{creating ? <LoaderCircle className="spin" size={15} /> : <Film size={15} />}{creating ? '正在提取…' : '转序列帧并保存'}</button></div></section><section><header><span>方式 02</span><strong>直接上传序列帧</strong><small>上传按文件名排序的 PNG 帧（最多 2000 张），并设置播放帧率。</small></header><div className="pet-animation-upload pet-frame-upload"><label htmlFor={`pet-sequence-frames-${pet.id}`}><input id={`pet-sequence-frames-${pet.id}`} type="file" accept="image/png,.png" multiple onChange={(event) => setDirectFrames(Array.from(event.target.files || []))} /><Upload size={16} /><span>{directFrames.length ? `已选择 ${directFrames.length} 张 PNG` : '选择 PNG 序列帧'}</span></label><input value={directName} maxLength={60} onChange={(event) => setDirectName(event.target.value)} placeholder="动作名称，例如：待机" /><NumberField label="播放帧率" value={directFps} onChange={(value) => setDirectFps(Math.min(60, Math.max(1, Number(value) || 12)))} /><button type="button" className="button primary" onClick={() => void uploadFrames()} disabled={uploadingFrames}>{uploadingFrames ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploadingFrames ? '正在保存…' : '上传并保存序列帧'}</button></div></section></div></section>

  return <>
  <section className="pet-animation-manager">
    <header><div><Film size={18} /><span><strong>动态素材</strong><small>先浏览各动作预览；每只宠物预制一项待机动作，实际素材可由视频转换或直接上传 PNG 序列帧。</small></span></div><strong>{actions.length} 项</strong></header>
    {/* {staticDemo ? <p className="pet-image-demo">在线演示版不支持动态素材上传；请在本地平台中管理宠物序列帧。</p> : <div className="pet-animation-methods">
      <section><header><span>方式 01</span><strong>视频转序列帧</strong><small>上传 MP4、WebM、MOV、MKV 或 AVI，按时间范围提取 PNG。</small></header><div className="pet-animation-upload"><label htmlFor={`pet-sequence-video-${pet.id}`}><input id={`pet-sequence-video-${pet.id}`} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi" onChange={(event) => setVideo(event.target.files?.[0] || null)} /><Upload size={16} /><span>{video ? video.name : '选择宠物动作视频'}</span></label><input value={videoName} maxLength={60} onChange={(event) => setVideoName(event.target.value)} placeholder="动画名称，例如：小猫待机" /><NumberField label="采样帧率" value={fps} onChange={(value) => setFps(Math.min(60, Math.max(1, Number(value) || 12)))} /><NumberField label="开始时间" unit="秒" value={startTime} onChange={(value) => setStartTime(Math.max(0, Number(value) || 0))} /><NumberField label="结束时间" unit="秒" value={endTime} onChange={setEndTime} placeholder="视频结尾" /><button type="button" className="button primary" onClick={() => void createFromVideo()} disabled={creating}>{creating ? <LoaderCircle className="spin" size={15} /> : <Film size={15} />}{creating ? '正在提取…' : '转序列帧并保存'}</button></div></section>
      <section><header><span>方式 02</span><strong>直接上传序列帧</strong><small>上传按文件名排序的 PNG 帧（最多 2000 张），并设置播放帧率。</small></header><div className="pet-animation-upload pet-frame-upload"><label htmlFor={`pet-sequence-frames-${pet.id}`}><input id={`pet-sequence-frames-${pet.id}`} type="file" accept="image/png,.png" multiple onChange={(event) => setDirectFrames(Array.from(event.target.files || []))} /><Upload size={16} /><span>{directFrames.length ? `已选择 ${directFrames.length} 张 PNG` : '选择 PNG 序列帧'}</span></label><input value={directName} maxLength={60} onChange={(event) => setDirectName(event.target.value)} placeholder="动画名称，例如：小猫挥手" /><NumberField label="播放帧率" value={directFps} onChange={(value) => setDirectFps(Math.min(60, Math.max(1, Number(value) || 12)))} /><button type="button" className="button primary" onClick={() => void uploadFrames()} disabled={uploadingFrames}>{uploadingFrames ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploadingFrames ? '正在保存…' : '上传并保存序列帧'}</button></div></section>
    </div>} */}
    {error && <p className="pet-image-error">{error}</p>}
    {loading ? <div className="pet-animation-empty"><LoaderCircle className="spin" size={18} /> 正在读取宠物动画…</div> : <div className="pet-animation-list">{actions.map((sequence) => <PetSequencePreview key={sequence.id} sequence={sequence} onOpen={() => { setDetailSequence(sequence); setVideoName(sequence.name); setDirectName(sequence.name) }} />)}</div>}
  </section>
  {detailSequence && createPortal(<PetSequenceDetailDialog sequence={detailSequence} importPanel={importPanel} error={error} onClose={() => setDetailSequence(null)} onConfigure={() => setParameterDraft({ sequence: detailSequence, value: { ...defaultAnimationParameters(), ...detailSequence.animationParameters } })} onDelete={() => void removeSequence(detailSequence)} />, document.body)}
  {parameterDraft && createPortal(<PetAnimationParametersDialog sequence={parameterDraft.sequence} value={parameterDraft.value} saving={savingParameters} onChange={(value) => setParameterDraft({ ...parameterDraft, value })} onCancel={() => setParameterDraft(null)} onSave={() => void saveParameters()} />, document.body)}
  </>
}

function PetSequencePreview({ sequence, onOpen }: { sequence: PetAnimationAction; onOpen: () => void }) {
  const [frame, setFrame] = useState(0)
  const frameCount = sequence.frameUrls.length
  useEffect(() => setFrame(0), [sequence.id])
  useEffect(() => {
    if (frameCount <= 1) return
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frameCount), 1000 / Math.max(1, sequence.fps))
    return () => window.clearInterval(timer)
  }, [frameCount, sequence.fps])
  return <button type="button" className="pet-sequence-preview" onClick={onOpen} aria-label={`打开动作设定：${sequence.name}`}><div className="pet-sequence-preview-stage" style={{ aspectRatio: frameCount > 0 ? `${sequence.width} / ${sequence.height}` : '1 / 1' }}>{frameCount > 0 ? <img src={sequence.frameUrls[frame]} alt={`${sequence.name}动态预览`} /> : sequence.previewImageUrl ? <img src={sequence.previewImageUrl} alt={`${sequence.name}待机动作预览`} /> : <PawPrint size={31} />}</div><footer><strong>{sequence.name}</strong><span>{sequence.isPreset ? '待制作' : '设定'}</span></footer></button>
}

function PetSequenceDetailDialog({ sequence, importPanel, error, onClose, onConfigure, onDelete }: { sequence: PetAnimationAction; importPanel: ReactNode; error: string; onClose: () => void; onConfigure: () => void; onDelete: () => void }) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const frameCount = sequence.frameUrls.length
  const parameters = { ...defaultAnimationParameters(), ...sequence.animationParameters }
  useEffect(() => setFrame(0), [sequence.id])
  useEffect(() => {
    if (!playing || frameCount <= 1) return
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frameCount), 1000 / Math.max(1, sequence.fps))
    return () => window.clearInterval(timer)
  }, [frameCount, playing, sequence.fps])
  return <div className="pet-sequence-detail-backdrop" role="presentation"><section className="pet-sequence-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="pet-sequence-detail-title"><header><div><span>ANIMATION ACTION SETUP</span><h3 id="pet-sequence-detail-title">{sequence.name}</h3><p>{sequence.isPreset ? '预制待机动作模板 · 等待导入正式序列帧' : `${sequence.frameCount} 帧 · ${sequence.fps} FPS · ${sequence.width}×${sequence.height}px · ${sequence.duration.toFixed(2)} 秒`}</p></div><button type="button" onClick={onClose} aria-label="关闭动态素材设定"><X size={19} /></button></header><div className="pet-sequence-detail-body"><div className="pet-sequence-detail-stage" style={{ aspectRatio: frameCount > 0 ? `${sequence.width} / ${sequence.height}` : '1 / 1' }}>{frameCount > 0 ? <img src={sequence.frameUrls[frame]} alt={`${sequence.name} 第 ${frame + 1} 帧`} /> : sequence.previewImageUrl ? <img src={sequence.previewImageUrl} alt={`${sequence.name}待机动作预览`} /> : <PawPrint size={58} />}</div><aside><div className="pet-sequence-detail-meta"><strong>动作设定</strong><small><b>模型：</b>{parameters.model}</small><small><b>时长 / 比例：</b>{parameters.duration} · {parameters.aspectRatio}</small><small><b>动作内容：</b>{parameters.actionContent || '尚未填写。'}</small><small><b>风格：</b>{parameters.style || '尚未填写。'}</small><small><b>背景：</b>{parameters.background}</small><small><b>台词 / 旁白：</b>{parameters.dialogueAudio}</small><small><b>禁止：</b>{parameters.prohibitions}</small></div><div className="pet-sequence-detail-actions">{!sequence.isPreset && <><button type="button" onClick={() => setPlaying((current) => !current)}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? '暂停' : '播放'}</button><button type="button" onClick={() => { setFrame(0); setPlaying(true) }}><RotateCcw size={15} /> 从头播放</button></>}<button type="button" onClick={onConfigure}><SlidersHorizontal size={15} /> 编辑动作设定</button>{!sequence.isPreset && <button type="button" onClick={onDelete}><Trash2 size={15} /> 删除序列帧</button>}</div>{!sequence.isPreset && <label className="pet-sequence-detail-progress"><span>第 {frame + 1} / {frameCount} 帧</span><input type="range" min="0" max={Math.max(0, frameCount - 1)} value={frame} onChange={(event) => { setFrame(Number(event.target.value)); setPlaying(false) }} aria-label={`${sequence.name}播放进度`} /></label>}{sequence.outputDirectory && <code>{sequence.outputDirectory}</code>}</aside><div className="pet-sequence-detail-import">{importPanel}{error && <p className="pet-image-error">{error}</p>}</div></div></section></div>
}

function PetAnimationParametersDialog({ sequence, value, saving, onChange, onCancel, onSave }: { sequence: PetAnimationAction; value: AnimationParameters; saving: boolean; onChange: (value: AnimationParameters) => void; onCancel: () => void; onSave: () => void }) {
  const set = <K extends keyof AnimationParameters>(key: K, next: AnimationParameters[K]) => onChange({ ...value, [key]: next })
  const fields: Array<{ key: keyof AnimationParameters; label: string; multiline?: boolean; placeholder?: string }> = [
    { key: 'model', label: '模型' }, { key: 'duration', label: '时长', placeholder: `实际播放时长 ${sequence.duration.toFixed(2)} 秒` }, { key: 'aspectRatio', label: '比例' }, { key: 'referenceImage', label: '参考图', multiline: true, placeholder: '填写对应宠物的正面锚点图、素材名称或素材 ID。' }, { key: 'actionContent', label: '动作内容', multiline: true, placeholder: '按动作阶段记录循环、姿态、幅度与节奏。' }, { key: 'style', label: '风格', multiline: true, placeholder: '填写光照、材质、渲染风格与接地阴影要求。' }, { key: 'background', label: '背景', multiline: true }, { key: 'dialogueAudio', label: '台词 / 旁白', multiline: true }, { key: 'prohibitions', label: '禁止', multiline: true },
  ]
  return <div className="pet-parameter-backdrop" role="presentation"><section className="pet-parameter-dialog" role="dialog" aria-modal="true" aria-labelledby="pet-parameter-title"><header><div><span>ANIMATION PARAMETERS</span><h3 id="pet-parameter-title">动态素材参数设定 · {sequence.name}</h3><p>{sequence.isPreset ? '待机模板的修改将应用到当前宠物草稿；请再点击底部“保存宠物内容”完成入库。' : '参数用于 AI 生成参考与验收记录；实际帧数、FPS 与播放时长仍以已保存序列帧为准。'}</p></div><button type="button" onClick={onCancel} disabled={saving} aria-label="关闭参数设定"><X size={18} /></button></header><div className="pet-parameter-fields">{fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.multiline ? <textarea rows={field.key === 'actionContent' || field.key === 'style' ? 3 : 2} value={value[field.key]} placeholder={field.placeholder} onChange={(event) => set(field.key, event.target.value)} /> : <input value={value[field.key]} placeholder={field.placeholder} onChange={(event) => set(field.key, event.target.value)} />}</label>)}</div><footer><button type="button" className="button ghost" onClick={onCancel} disabled={saving}>取消</button><button type="button" className="button primary" onClick={onSave} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? '正在保存…' : sequence.isPreset ? '应用待机设定' : '保存参数设定'}</button></footer></section></div>
}

function PetCard({ pet, asset, onEdit, onRemove, removing }: { pet: Pet; asset?: ImageAsset; onEdit: () => void; onRemove: () => void; removing: boolean }) {
  return <article className="pet-card"><div className="pet-card-preview">{asset ? <img src={asset.imageUrl} alt={`${pet.chineseName}形象预览`} /> : <PawPrint size={28} />}{asset && <span>主预览</span>}</div><div className="pet-card-actions"><button onClick={onEdit}><PencilLine size={14} /></button><button onClick={onRemove} disabled={removing}><Trash2 size={14} /></button></div><span>{rarityCopy[pet.rarity]} · {statusCopy[pet.status]}</span><h3>{pet.chineseName}<small>{pet.spanishName}</small></h3><p><strong>设计来源：</strong>{pet.designSource || '尚未填写。'}</p><p><strong>外观设定：</strong>{pet.appearanceDesign || '尚未填写。'}</p><small>{pet.imageAssetIds.length ? `${pet.imageAssetIds.length} 张已关联形象图` : '尚未关联宠物形象图'}</small><code>{pet.id}</code></article>
}
