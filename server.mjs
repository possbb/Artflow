import express from 'express'
import multer from 'multer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const app = express()
const port = 4174
const workspaceRoot = resolve(process.cwd())
const dataRoot = join(workspaceRoot, 'project-data')
const projectsRoot = join(dataRoot, 'projects')
const incomingRoot = join(dataRoot, '.incoming')
const defaultProjectId = 'project-default'
const supportedModules = new Set(['character-motion', 'skill-vfx', 'pet-content'])
const assetModules = new Set(['main-visual-design', 'character-design', 'character-motion', 'skill-design', 'skill-vfx', 'background-design', 'map-elements', 'game-ui', 'story-level-design', 'pet-content', 'unassigned'])
const supportedExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi'])
const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const supportedAudioExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'])
const projectIdPattern = /^project-(?:default|\d{13}-[a-f0-9]{8})$/i

await mkdir(projectsRoot, { recursive: true })
await mkdir(incomingRoot, { recursive: true })

const upload = multer({
  dest: incomingRoot,
  limits: { fileSize: 250 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = extname(file.originalname).toLowerCase()
    callback(null, file.mimetype.startsWith('video/') || supportedExtensions.has(extension))
  },
})

const imageUpload = multer({
  dest: incomingRoot,
  limits: { fileSize: 40 * 1024 * 1024, files: 12 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith('image/') && supportedImageExtensions.has(extname(file.originalname).toLowerCase()))
  },
})

const frameImageUpload = multer({
  dest: incomingRoot,
  limits: { fileSize: 20 * 1024 * 1024, files: 2000 },
  fileFilter: (_request, file, callback) => {
    callback(null, extname(file.originalname).toLowerCase() === '.png')
  },
})

const audioUpload = multer({
  dest: incomingRoot,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = extname(file.originalname).toLowerCase()
    callback(null, file.mimetype.startsWith('audio/') || supportedAudioExtensions.has(extension))
  },
})

app.use(express.json({ limit: '2mb' }))
app.use('/project-data', express.static(dataRoot, {
  dotfiles: 'deny',
  index: false,
  fallthrough: false,
}))
app.use('/project-assets/:projectId', async (request, response, next) => {
  try {
    const assetRoot = await getProjectAssetFolder(request.params.projectId)
    express.static(assetRoot, { dotfiles: 'deny', index: false, fallthrough: false })(request, response, next)
  } catch {
    response.status(404).json({ error: '项目素材目录不存在。' })
  }
})

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else rejectPromise(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

function selectFolderWithSystemDialog() {
  if (process.platform !== 'win32') throw new Error('当前系统暂不支持原生文件夹选择器。')
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = '选择已有文件夹作为项目美术素材存放位置'",
    '$dialog.ShowNewFolderButton = $true',
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath); exit 0 }",
    'exit 2',
  ].join('; ')
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim())
      else if (code === 2) resolvePromise('')
      else rejectPromise(new Error(stderr.trim() || '无法打开文件夹选择器。'))
    })
  })
}

function assertProjectId(value) {
  const projectId = String(value || '')
  if (!projectIdPattern.test(projectId)) throw new Error('无效的项目 ID。')
  return projectId
}

function getProjectFolder(projectId) {
  return join(projectsRoot, assertProjectId(projectId))
}

function normalizeAssetStoragePath(value) {
  const rawPath = String(value || '').trim()
  if (!rawPath) return ''
  if (!isAbsolute(rawPath)) throw new Error('素材目录必须使用完整的绝对路径。')
  const storagePath = resolve(rawPath)
  if (parse(storagePath).root === storagePath) throw new Error('不能直接使用磁盘根目录存放项目素材。')
  const relativeToProjects = relative(projectsRoot, storagePath)
  if (!relativeToProjects || (!relativeToProjects.startsWith('..') && !isAbsolute(relativeToProjects))) {
    throw new Error('请不要选择平台内部的 project-data/projects 目录。')
  }
  return storagePath
}

function samePath(first, second) {
  return resolve(first).toLowerCase() === resolve(second).toLowerCase()
}

function projectAssetFolder(project) {
  return project.assetStoragePath ? resolve(project.assetStoragePath) : getProjectFolder(project.id)
}

async function getProjectAssetFolder(projectId) {
  return projectAssetFolder(await readProject(projectId))
}

async function ensureProjectFolders(projectId, assetStoragePath = '') {
  const projectFolder = getProjectFolder(projectId)
  const assetRoot = assetStoragePath || projectFolder
  await Promise.all([
    mkdir(projectFolder, { recursive: true }),
    mkdir(join(assetRoot, 'assets', 'source'), { recursive: true }),
    mkdir(join(assetRoot, 'assets', 'runtime'), { recursive: true }),
    mkdir(join(assetRoot, 'assets', 'references'), { recursive: true }),
    mkdir(join(assetRoot, 'assets', 'versions'), { recursive: true }),
    mkdir(join(assetRoot, 'frame-sequences'), { recursive: true }),
    mkdir(join(projectFolder, 'evidence'), { recursive: true }),
  ])
  return { projectFolder, assetRoot }
}

async function createProjectRecord({ id, name, description = '', isDefault = false, assetStoragePath = '', assetStorageBasePath = '' }) {
  const normalizedStoragePath = normalizeAssetStoragePath(assetStoragePath)
  const normalizedBasePath = normalizeAssetStoragePath(assetStorageBasePath)
  const { projectFolder } = await ensureProjectFolders(id, normalizedStoragePath)
  const now = new Date().toISOString()
  const record = {
    schemaVersion: 2,
    id,
    name: String(name).trim().slice(0, 60),
    description: String(description).trim().slice(0, 240),
    assetStoragePath: normalizedStoragePath,
    assetStorageBasePath: normalizedBasePath || normalizedStoragePath,
    assetStorageMode: normalizedStoragePath ? 'external' : 'managed',
    createdAt: now,
    updatedAt: now,
    isDefault,
  }
  await writeFile(join(projectFolder, 'project.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  return record
}

async function readProject(projectId) {
  const projectFolder = getProjectFolder(projectId)
  const raw = await readFile(join(projectFolder, 'project.json'), 'utf8')
  return JSON.parse(raw)
}

async function countDirectories(folder) {
  try {
    return (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length
  } catch {
    return 0
  }
}

async function countImageAssets(folder) {
  let count = 0
  async function visit(current) {
    let entries = []
    try { entries = await readdir(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) await visit(fullPath)
      else if (/\.(png|jpe?g|webp|gif|svg)$/i.test(entry.name)) count += 1
    }
  }
  await visit(folder)
  return count
}

async function decorateProject(project) {
  const assetRoot = projectAssetFolder(project)
  const [frameSequenceCount, imageAssetCount] = await Promise.all([
    countDirectories(join(assetRoot, 'frame-sequences')),
    countImageAssets(join(assetRoot, 'assets', 'source')),
  ])
  return {
    ...project,
    assetStoragePath: assetRoot,
    assetStorageBasePath: project.assetStorageBasePath ? resolve(project.assetStorageBasePath) : assetRoot,
    assetStorageMode: project.assetStoragePath ? 'external' : 'managed',
    frameSequenceCount,
    imageAssetCount,
  }
}

async function listProjects() {
  const entries = await readdir(projectsRoot, { withFileTypes: true })
  const projects = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !projectIdPattern.test(entry.name)) continue
    try { projects.push(await decorateProject(await readProject(entry.name))) } catch { /* Ignore incomplete project folders. */ }
  }
  return projects.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

if (!existsSync(join(projectsRoot, defaultProjectId, 'project.json'))) {
  await createProjectRecord({
    id: defaultProjectId,
    name: '默认游戏项目',
    description: '现有工作区迁移生成的默认项目',
    isDefault: true,
  })
}

async function probeVideo(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,avg_frame_rate:format=duration',
    '-of', 'json',
    filePath,
  ])
  const data = JSON.parse(stdout)
  const stream = data.streams?.[0]
  if (!stream) throw new Error('上传文件中没有可读取的视频画面。')
  return {
    duration: Number(data.format?.duration || 0),
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
    sourceFrameRate: stream.avg_frame_rate || 'unknown',
  }
}

async function probeImage(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,pix_fmt',
    '-of', 'json',
    filePath,
  ])
  const stream = JSON.parse(stdout).streams?.[0]
  if (!stream?.width || !stream?.height) throw new Error('无法读取图片尺寸。')
  const pixelFormat = String(stream.pix_fmt || '')
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    pixelFormat,
    alphaDetected: /(^|[^a-z])(rgba|bgra|argb|abgr|yuva|gbrap|pal8)/i.test(pixelFormat) || /a(?:p|le|be)?$/i.test(pixelFormat),
  }
}

function cleanName(value) {
  const trimmed = String(value || '').trim().slice(0, 60)
  return trimmed || '未命名序列'
}

function cleanFolderSegment(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 48)
  return cleaned || 'project'
}

function parseNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeUploadedFileName(value) {
  const original = String(value || '').normalize('NFC')
  if (!/[\u0080-\u00ff]/.test(original)) return original
  const decoded = Buffer.from(original, 'latin1').toString('utf8')
  return decoded.includes('\ufffd') ? original : decoded.normalize('NFC')
}

function defaultAnimationParameters() {
  return {
    model: 'seedance_2.0_fast（默认）',
    duration: '5 秒（循环待机）',
    aspectRatio: '1:1（适合宠物展示，角色居中）',
    referenceImage: '',
    actionContent: '',
    style: '',
    background: '简洁暖米色中性背景，无场景元素',
    dialogueAudio: '无，纯动画 + 环境音',
    prohibitions: '文字/水印、照片写实、攻击性动作、角色身份漂移、镜头旋转',
  }
}

function normalizeAnimationParameters(value) {
  const defaults = defaultAnimationParameters()
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, cleanCityText(value?.[key], 1200) || fallback]))
}

function defaultIdleAnimationParameters() {
  return {
    ...defaultAnimationParameters(),
    actionContent: '温和呼吸起伏 → 缓慢眨眼 → 轻微摆尾或局部装饰摆动 → 回到起始姿态，循环流畅无跳变。',
    style: '继承项目主视觉的材质、左上主光、柔和环境光与干净接地阴影。',
  }
}

function normalizeIdleAnimationParameters(value) {
  const defaults = defaultIdleAnimationParameters()
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, cleanCityText(value?.[key], 1200) || fallback]))
}

function toPublicManifest(manifest) {
  const baseUrl = `/project-assets/${manifest.projectId}/frame-sequences/${manifest.id}`
  return {
    ...manifest,
    sourceType: manifest.sourceType || (manifest.sourceFile ? 'video-to-frames' : 'uploaded-png-sequence'),
    animationParameters: normalizeAnimationParameters(manifest.animationParameters),
    sourceUrl: manifest.sourceFile ? `${baseUrl}/${manifest.sourceFile}` : '',
    manifestUrl: `${baseUrl}/manifest.json`,
    frameUrls: manifest.frames.map((frame) => `${baseUrl}/frames/${frame}`),
  }
}

async function loadManifests(projectId, moduleId, petId = '') {
  const sequencesRoot = join(await getProjectAssetFolder(projectId), 'frame-sequences')
  const entries = await readdir(sequencesRoot, { withFileTypes: true })
  const manifests = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(sequencesRoot, entry.name, 'manifest.json'), 'utf8')
      const manifest = JSON.parse(raw)
      if ((!moduleId || manifest.moduleId === moduleId) && (!petId || manifest.petId === petId)) manifests.push(toPublicManifest(manifest))
    } catch { /* Ignore incomplete sequence folders. */ }
  }
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function toPublicCompletedSequence(manifest) {
  const baseUrl = `/project-assets/${manifest.projectId}/assets/runtime/${manifest.moduleId}/${manifest.id}`
  return {
    ...manifest,
    manifestUrl: `${baseUrl}/asset.json`,
    frameUrls: manifest.frames.map((frame) => `${baseUrl}/frames/${frame}`),
  }
}

async function loadCompletedSequences(projectId, moduleId) {
  const moduleRoot = join(await getProjectAssetFolder(projectId), 'assets', 'runtime', moduleId)
  let entries = []
  try { entries = await readdir(moduleRoot, { withFileTypes: true }) } catch { return [] }
  const assets = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const manifest = JSON.parse(await readFile(join(moduleRoot, entry.name, 'asset.json'), 'utf8'))
      if (manifest.assetType === 'frame-sequence') assets.push(toPublicCompletedSequence(manifest))
    } catch { /* Ignore incomplete runtime asset folders. */ }
  }
  return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function loadImageAssets(projectId, moduleId) {
  const sourceRoot = join(await getProjectAssetFolder(projectId), 'assets', 'source')
  const assets = []
  let moduleFolders = []
  try { moduleFolders = await readdir(sourceRoot, { withFileTypes: true }) } catch { return assets }
  for (const moduleFolder of moduleFolders) {
    if (!moduleFolder.isDirectory() || (moduleId && moduleFolder.name !== moduleId)) continue
    const modulePath = join(sourceRoot, moduleFolder.name)
    for (const assetFolder of await readdir(modulePath, { withFileTypes: true })) {
      if (!assetFolder.isDirectory()) continue
      try {
        const manifest = JSON.parse(await readFile(join(modulePath, assetFolder.name, 'asset.json'), 'utf8'))
        assets.push({
          ...manifest,
          originalName: normalizeUploadedFileName(manifest.originalName),
          imageUrl: `/project-assets/${projectId}/assets/source/${moduleFolder.name}/${assetFolder.name}/${manifest.fileName}`,
        })
      } catch { /* Ignore incomplete image folders. */ }
    }
  }
  return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const assetLifecycleStatuses = new Set(['draft', 'in_review', 'confirmed', 'deprecated'])
const assetRelationTypes = new Set(['character', 'skill', 'level', 'ui', 'scene', 'other'])
const dependencyGraph = {
  'gameplay-design': ['detailed-gameplay-design', 'main-visual-design', 'story-level-design'],
  'detailed-gameplay-design': ['main-visual-design', 'character-design', 'character-motion', 'skill-design', 'skill-vfx', 'game-ui', 'story-level-design', 'background-design', 'map-elements'],
  'main-visual-design': ['character-design', 'character-motion', 'skill-design', 'skill-vfx', 'game-ui', 'story-level-design', 'background-design', 'map-elements', 'pet-content'],
  'character-design': ['character-motion', 'skill-design'],
  'character-motion': ['skill-vfx'],
  'skill-design': ['skill-vfx'],
  'story-level-design': ['background-design', 'map-elements'],
  'background-design': ['map-elements'],
}

function registryFile(projectId) {
  return join(getProjectFolder(projectId), 'asset-registry.json')
}

function standardsFile(projectId) {
  return join(getProjectFolder(projectId), 'technical-standards.json')
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

const projectPlanStatuses = new Set(['not_started', 'in_progress', 'blocked', 'completed'])

function projectPlanFile(projectId) {
  return join(getProjectFolder(projectId), 'project-plan.json')
}

function defaultProjectPlan(projectId) {
  return { schemaVersion: 1, projectId, updatedAt: '', items: [] }
}

function normalizeProjectPlan(projectId, value) {
  const items = Array.isArray(value?.items) ? value.items : []
  if (items.length > 300) throw new Error('项目计划最多包含 300 个计划项。')
  const seenIds = new Set()
  const normalizedItems = items.map((item) => {
    let id = String(item?.id || '').trim().slice(0, 80) || `plan-${Date.now()}-${randomUUID().slice(0, 6)}`
    if (seenIds.has(id)) id = `${id}-${randomUUID().slice(0, 6)}`
    seenIds.add(id)
    const cleanDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : ''
    const progress = Math.min(100, Math.max(0, Math.round(parseNumber(item?.progress, 0))))
    return {
      id,
      phaseName: String(item?.phaseName || '未分组阶段').trim().slice(0, 60) || '未分组阶段',
      phaseOrder: Math.min(999, Math.max(1, Math.round(parseNumber(item?.phaseOrder, 1)))),
      title: String(item?.title || '').trim().slice(0, 120),
      description: String(item?.description || '').trim().slice(0, 1000),
      status: projectPlanStatuses.has(item?.status) ? item.status : 'not_started',
      progress,
      owner: String(item?.owner || '').trim().slice(0, 60),
      startDate: cleanDate(item?.startDate),
      dueDate: cleanDate(item?.dueDate),
      moduleId: String(item?.moduleId || '').trim().slice(0, 80),
      acceptance: String(item?.acceptance || '').trim().slice(0, 1000),
      updatedAt: new Date().toISOString(),
    }
  })
  if (normalizedItems.some((item) => !item.title)) throw new Error('每个计划项都必须填写标题。')
  return { schemaVersion: 1, projectId, updatedAt: new Date().toISOString(), items: normalizedItems }
}

const mainVisualDeliverableStatuses = new Set(['not_started', 'in_progress', 'in_review', 'approved', 'blocked'])
const mainVisualRightsStatuses = new Set(['pending', 'cleared', 'not_applicable'])

function mainVisualDeliverablesFile(projectId) {
  return join(getProjectFolder(projectId), 'main-visual-deliverables.json')
}

function defaultMainVisualDeliverables(projectId) {
  const definitions = [
    ['creative-brief', '定义', '主视觉创意简报', 'text', '统一记录世界观、目标受众、核心体验、平台、情绪和禁止方向。', '内容与玩法设计和详细玩法设计一致；范围、受众、平台和禁止项均有明确结论。'],
    ['style-exploration-boards', '探索', '风格探索板（至少 3 组）', 'image', '对构图、色彩、材质、光照和细节密度进行可比较的风格探索。', '至少 3 组方案并排比较；记录筛选理由、淘汰原因和最终选择。'],
    ['gameplay-anchor', '核心图像', '游戏镜头主视觉锚点图', 'image', '在实际游戏镜头下验证角色、场景、路线、线索和交互目标的可读性。', '使用目标宽高比和固定镜头；角色、路线、线索与宝箱层级清楚，并通过实际缩放检查。'],
    ['key-visual', '核心图像', '展示性关键视觉图', 'image', '用于宣传与项目展示，同时保持与游戏内视觉一致。', '角色身份、材质、光向和色板与游戏镜头锚点一致；常见裁切比例下核心主体完整。'],
    ['visual-bible', '视觉系统', '项目视觉圣经', 'mixed', '记录全项目视觉固定规则、允许变化、禁止元素、例外审批和版本影响范围；技术接入规则只引用技术美术规范。', '下游模块无需重新猜测风格；视觉圣经不重复维护路径、命名、导入、层级编号、性能预算或运行时清单。'],
    ['color-system', '视觉系统', '项目色彩与功能色系统', 'mixed', '定义主色、辅色、强调色、中性色以及交互和功能色优先级。', '提供色值、使用比例、背景适配、对比度和主线／隐藏／交互目标的颜色层级。'],
    ['shape-language', '视觉系统', '形状、轮廓与装饰语言', 'mixed', '定义角色、建筑、道具、图标的轮廓倾向、圆角、边缘和装饰母题。', '提供可复用的正反例；不同模块并排时保持同一形状语言且不损害可读性。'],
    ['material-lighting-samples', '渲染系统', '材质、光照、阴影与后期样张', 'mixed', '锁定表面质感、纹理密度、主光方向、环境光、接地阴影和后期色调。', '至少覆盖角色、建筑、地面、金属、布料和魔法效果；明暗场景下均保持统一且可读。'],
    ['module-adaptation-samples', '下游验证', '下游模块适配样张', 'mixed', '验证主视觉规则能够稳定扩展到角色、场景、地图元素、交互反馈和用户界面。', '至少包含角色、场景、交互物和界面四类样张；并排检查色板、材质、轮廓、镜头和细节密度。'],
    ['final-approval', '批准归档', '主视觉最终批准与影响记录', 'text', '登记批准版本、权利结论和受影响模块。', '全部前置交付物已批准；主视觉正式版本可追溯，权利状态明确，下游影响与例外均已记录。'],
  ]
  return {
    schemaVersion: 2,
    projectId,
    updatedAt: '',
    items: definitions.map(([id, category, title, contentKind, purpose, acceptance], index) => ({
      id,
      order: index + 1,
      category,
      title,
      contentKind,
      purpose,
      acceptance,
      contentText: '',
      imageAssetIds: [],
      status: 'not_started',
      owner: 'weiyuchen',
      version: 'v001',
      rightsStatus: 'not_applicable',
      updatedAt: '',
    })),
  }
}

function normalizeMainVisualDeliverables(projectId, value, validationItemId = '') {
  const template = defaultMainVisualDeliverables(projectId)
  const incomingItems = Array.isArray(value?.items) ? value.items : []
  if (incomingItems.length > 30) throw new Error('主视觉交付物记录最多包含 30 项。')
  const incomingById = new Map(incomingItems.map((item) => [String(item?.id || ''), item]))
  const now = new Date().toISOString()
  const items = template.items.map((definition) => {
    const item = incomingById.get(definition.id) || definition
    const status = mainVisualDeliverableStatuses.has(item?.status) ? item.status : 'not_started'
    const rightsStatus = mainVisualRightsStatuses.has(item?.rightsStatus) ? item.rightsStatus : 'not_applicable'
    const version = String(item?.version || '').trim().slice(0, 60) || 'v001'
    const contentText = String(item?.contentText || '').trim().slice(0, 20000)
    const imageAssetIds = [...new Set((Array.isArray(item?.imageAssetIds) ? item.imageAssetIds : [])
      .map((id) => String(id || '').trim())
      .filter((id) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(id)))]
      .slice(0, 30)
    const shouldValidate = definition.id === validationItemId
    if (shouldValidate && status === 'approved' && (!version || rightsStatus === 'pending')) {
      throw new Error(`“${definition.title}”标记为已批准前，请填写版本和权利结论。`)
    }
    return {
      ...definition,
      contentText,
      imageAssetIds,
      status,
      owner: String(item?.owner || '').trim().slice(0, 80) || 'weiyuchen',
      version,
      rightsStatus,
      updatedAt: String(item?.updatedAt || '').trim() || now,
    }
  })
  return { schemaVersion: 2, projectId, updatedAt: now, items }
}

const characterSettingStates = new Set(['draft', 'review', 'locked'])
const characterPriorities = new Set(['P0', 'P1', 'P2'])

function characterSettingSheetsFile(projectId) {
  return join(getProjectFolder(projectId), 'character-setting-sheets.json')
}

function defaultCharacterSettingSheets(projectId) {
  return { schemaVersion: 1, projectId, updatedAt: '', characters: [] }
}

function cleanCharacterSettingText(value, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanCharacterSettingId(value, fallback) {
  const id = cleanCharacterSettingText(value, 80).toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return id || fallback
}

function normalizeCharacterSettingSheets(projectId, value) {
  const incoming = Array.isArray(value?.characters) ? value.characters : []
  if (incoming.length > 100) throw new Error('角色设定表最多包含 100 个角色。')
  const seenIds = new Set()
  const now = new Date().toISOString()
  const characters = incoming.map((character, index) => {
    const id = cleanCharacterSettingId(character?.id, `character_${index + 1}`)
    if (seenIds.has(id)) throw new Error(`角色 ID 重复：${id}`)
    seenIds.add(id)
    const displayName = cleanCharacterSettingText(character?.displayName, 100)
    if (!displayName) throw new Error(`角色 ${id} 必须填写名称。`)
    const referenceAssetIds = [...new Set((Array.isArray(character?.referenceAssetIds) ? character.referenceAssetIds : [])
      .map((assetId) => cleanCharacterSettingText(assetId, 80))
      .filter((assetId) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(assetId)))]
      .slice(0, 30)
    return {
      id,
      displayName,
      roleType: cleanCharacterSettingText(character?.roleType, 60),
      priority: characterPriorities.has(character?.priority) ? character.priority : 'P1',
      state: characterSettingStates.has(character?.state) ? character.state : 'draft',
      narrativeRole: cleanCharacterSettingText(character?.narrativeRole, 800),
      ageAndProportion: cleanCharacterSettingText(character?.ageAndProportion, 800),
      identityAnchors: cleanCharacterSettingText(character?.identityAnchors, 1200),
      silhouetteAndFeatures: cleanCharacterSettingText(character?.silhouetteAndFeatures, 1000),
      outfitAndAccessories: cleanCharacterSettingText(character?.outfitAndAccessories, 1200),
      paletteAndMaterials: cleanCharacterSettingText(character?.paletteAndMaterials, 1000),
      requiredViews: cleanCharacterSettingText(character?.requiredViews, 600),
      expressionsAndPoses: cleanCharacterSettingText(character?.expressionsAndPoses, 1000),
      motionHandoff: cleanCharacterSettingText(character?.motionHandoff, 1200),
      referenceAssetIds,
      version: cleanCharacterSettingText(character?.version, 60) || 'v001',
      updatedAt: cleanCharacterSettingText(character?.updatedAt, 60) || now,
    }
  })
  return { schemaVersion: 1, projectId, updatedAt: now, characters }
}

const cityContentStatuses = new Set(['planning', 'production', 'review', 'ready', 'released'])
const cityItemStatuses = new Set(['planned', 'in_progress', 'ready'])
const chestTypes = new Set(['main', 'hidden'])
const chestWordRoles = new Set(['new', 'review', 'distractor'])
const chestGamePurposes = new Set(['teach', 'review', 'final'])
const petRarities = new Set(['common', 'rare'])
const cityMusicScopes = new Set(['city', 'area'])
const cityMusicTriggers = new Set(['default', 'exploration', 'chest', 'completion'])

function petContentFile(projectId) {
  return join(getProjectFolder(projectId), 'pet-content.json')
}

function defaultPetContent(projectId) {
  return { schemaVersion: 1, projectId, updatedAt: '', pets: [] }
}

async function assertPetExists(projectId, petId) {
  const content = existsSync(petContentFile(projectId))
    ? normalizePetContent(projectId, JSON.parse(await readFile(petContentFile(projectId), 'utf8')))
    : defaultPetContent(projectId)
  if (!content.pets.some((pet) => pet.id === petId)) throw new Error('当前宠物不存在，请先保存宠物内容。')
}

function gameContentFile(projectId) {
  return join(getProjectFolder(projectId), 'game-content.json')
}

function defaultGameContent(projectId) {
  return { schemaVersion: 1, projectId, updatedAt: '', games: [] }
}

function cityContentFile(projectId) {
  return join(getProjectFolder(projectId), 'city-content.json')
}

function defaultCityContent(projectId) {
  return { schemaVersion: 6, projectId, updatedAt: '', cities: [] }
}

function cleanCityText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanCityId(value, fallback) {
  const id = cleanCityText(value, 80).toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return id || fallback
}

function cleanCityStringList(value, maxItems = 100, maxLength = 80) {
  if (!Array.isArray(value)) return []
  return value.map((item) => cleanCityText(item, maxLength)).filter(Boolean).slice(0, maxItems)
}

function normalizePetContent(projectId, value) {
  const pets = Array.isArray(value?.pets) ? value.pets : []
  if (pets.length > 300) throw new Error('宠物内容最多包含 300 条记录。')
  const seenIds = new Set()
  const normalizedPets = pets.map((pet, index) => {
    let id = cleanCityId(pet?.id, `pet_${index + 1}`)
    if (seenIds.has(id)) id = `${id}_${index + 1}`
    seenIds.add(id)
    const imageAssetIds = [...new Set([
      ...cleanCityStringList(pet?.imageAssetIds, 12),
      cleanCityText(pet?.assetId, 80),
    ].filter((assetId) => /^asset-\d{13}-[a-f0-9]{8}$/i.test(assetId)))]
    const preferredPrimaryImageId = cleanCityText(pet?.primaryImageAssetId, 80)
    const primaryImageAssetId = imageAssetIds.includes(preferredPrimaryImageId) ? preferredPrimaryImageId : imageAssetIds[0] || ''
    return {
      id,
      spanishName: cleanCityText(pet?.spanishName, 100),
      chineseName: cleanCityText(pet?.chineseName, 100),
      rarity: petRarities.has(pet?.rarity) ? pet.rarity : 'common',
      designSource: cleanCityText(pet?.designSource ?? pet?.description, 600),
      appearanceDesign: cleanCityText(pet?.appearanceDesign, 600),
      idleAnimationParameters: normalizeIdleAnimationParameters(pet?.idleAnimationParameters),
      imageAssetIds,
      primaryImageAssetId,
      assetId: primaryImageAssetId,
      status: cityItemStatuses.has(pet?.status) ? pet.status : 'planned',
      updatedAt: new Date().toISOString(),
    }
  })
  if (normalizedPets.some((pet) => !pet.spanishName || !pet.chineseName)) throw new Error('每条宠物内容都必须填写西语名和中文名。')
  if (normalizedPets.some((pet) => pet.status === 'ready' && pet.imageAssetIds.length === 0)) throw new Error('宠物标记为已就绪前，至少需要关联一张设计形象图。')
  return { schemaVersion: 1, projectId, updatedAt: new Date().toISOString(), pets: normalizedPets }
}

function normalizeGameContent(projectId, value) {
  const games = Array.isArray(value?.games) ? value.games : []
  if (games.length > 300) throw new Error('游戏内容最多包含 300 条记录。')
  const seenIds = new Set()
  const normalizedGames = games.map((game, index) => {
    let id = cleanCityId(game?.id, `game_${index + 1}`)
    if (seenIds.has(id)) id = `${id}_${index + 1}`
    seenIds.add(id)
    return {
      id,
      name: cleanCityText(game?.name, 100),
      category: cleanCityText(game?.category, 80),
      description: cleanCityText(game?.description, 600),
      ruleReference: cleanCityText(game?.ruleReference, 120),
      assetId: cleanCityText(game?.assetId, 80),
      status: cityItemStatuses.has(game?.status) ? game.status : 'planned',
      updatedAt: new Date().toISOString(),
    }
  })
  if (normalizedGames.some((game) => !game.name || !game.category)) throw new Error('每条游戏内容都必须填写名称和类型。')
  return { schemaVersion: 1, projectId, updatedAt: new Date().toISOString(), games: normalizedGames }
}

function normalizeCityContent(projectId, value) {
  const cities = Array.isArray(value?.cities) ? value.cities : []
  if (cities.length > 100) throw new Error('城市内容最多包含 100 座城市。')
  const seenCityIds = new Set()
  const normalizedCities = cities.map((city, cityIndex) => {
    let id = cleanCityId(city?.id, `city_${cityIndex + 1}`)
    if (seenCityIds.has(id)) id = `${id}_${cityIndex + 1}`
    seenCityIds.add(id)
    const normalizeItems = (items, limit, mapItem) => (Array.isArray(items) ? items : []).slice(0, limit).map(mapItem)
    const areas = normalizeItems(city?.areas, 50, (area, index) => ({
      id: cleanCityId(area?.id, `${id}_area_${index + 1}`),
      name: cleanCityText(area?.name, 80),
      theme: cleanCityText(area?.theme, 120),
      description: cleanCityText(area?.description, 600),
      order: Math.min(999, Math.max(1, Math.round(parseNumber(area?.order, index + 1)))),
      status: cityItemStatuses.has(area?.status) ? area.status : 'planned',
    }))
    const chests = normalizeItems(city?.chests, 300, (chest, index) => {
      const type = chestTypes.has(chest?.type) ? chest.type : 'main'
      return {
        id: cleanCityId(chest?.id, `${id}_chest_${index + 1}`),
        name: cleanCityText(chest?.name, 100),
        areaId: cleanCityText(chest?.areaId, 80),
        type,
        culturalNote: cleanCityText(chest?.culturalNote, 600),
        status: cityItemStatuses.has(chest?.status) ? chest.status : 'planned',
      }
    })
    const vocabulary = normalizeItems(city?.vocabulary, 6000, (word, index) => ({
      id: cleanCityId(word?.id, `${id}_word_${index + 1}`),
      spanish: cleanCityText(word?.spanish, 100),
      english: cleanCityText(word?.english, 100),
      chinese: cleanCityText(word?.chinese, 100),
      category: cleanCityText(word?.category, 80),
      areaId: cleanCityText(word?.areaId, 80),
      status: cityItemStatuses.has(word?.status) ? word.status : 'planned',
    }))
    const chestTypeFor = (value) => chestTypes.has(value) ? value : chests.find((chest) => chest.id === cleanCityText(value, 80))?.type || 'main'
    const games = normalizeItems(city?.games, 300, (game, index) => ({
      id: cleanCityId(game?.id, `${id}_game_${index + 1}`),
      gameContentId: cleanCityText(game?.gameContentId, 80),
      chestType: chestTypeFor(game?.chestType || game?.chestId),
      order: Math.min(999, Math.max(1, Math.round(parseNumber(game?.order, index + 1)))),
      purpose: chestGamePurposes.has(game?.purpose) ? game.purpose : 'teach',
      questionCount: Math.min(20, Math.max(1, Math.round(parseNumber(game?.questionCount, 4)))),
      fallbackGameContentId: cleanCityText(game?.fallbackGameContentId, 80),
      status: cityItemStatuses.has(game?.status) ? game.status : 'planned',
    }))
    const pets = normalizeItems(city?.pets, 300, (pet, index) => ({
      id: cleanCityId(pet?.id, `${id}_pet_drop_${index + 1}`),
      petContentId: cleanCityText(pet?.petContentId, 80),
      chestType: chestTypeFor(pet?.chestType || pet?.chestId),
      weight: Math.round(Math.min(100, Math.max(0, parseNumber(pet?.weight, pet?.dropRate || 0))) * 100) / 100,
      enabled: pet?.enabled !== false,
      status: cityItemStatuses.has(pet?.status) ? pet.status : 'planned',
    }))
    const legacyWordLinks = []
    for (const sourceChest of Array.isArray(city?.chests) ? city.chests : []) {
      const chestId = cleanCityText(sourceChest?.id, 80)
      const chestType = chests.find((chest) => chest.id === chestId)?.type || 'main'
      for (const wordId of cleanCityStringList(sourceChest?.wordIds, 12)) legacyWordLinks.push({ chestId, wordId, role: chestType === 'main' ? 'new' : 'review' })
    }
    for (const sourceWord of Array.isArray(city?.vocabulary) ? city.vocabulary : []) {
      const chestId = cleanCityText(sourceWord?.chestId, 80)
      if (chestId) legacyWordLinks.push({ chestId, wordId: cleanCityText(sourceWord?.id, 80), role: 'new' })
    }
    const sourceWordLinks = Array.isArray(city?.gameWordLinks) ? city.gameWordLinks : Array.isArray(city?.chestWordLinks) ? city.chestWordLinks : legacyWordLinks
    const seenWordPairs = new Set()
    const gameWordLinks = normalizeItems(sourceWordLinks, 12000, (link, index) => {
      const gameId = cleanCityText(link?.gameId, 80) || games.find((game) => game.chestType === chestTypeFor(link?.chestType || link?.chestId))?.id || ''
      const wordId = cleanCityText(link?.wordId, 80)
      const pairKey = `${gameId}:${wordId}`
      if (!gameId || !wordId || seenWordPairs.has(pairKey)) return null
      seenWordPairs.add(pairKey)
      return {
        id: cleanCityId(link?.id, `${id}_game_word_${index + 1}`),
        gameId,
        wordId,
        role: chestWordRoles.has(link?.role) ? link.role : 'review',
        order: Math.min(999, Math.max(1, Math.round(parseNumber(link?.order, index + 1)))),
        status: cityItemStatuses.has(link?.status) ? link.status : 'planned',
      }
    }).filter(Boolean)
    const backgroundMusic = normalizeItems(city?.backgroundMusic, 1, (music, index) => ({
      id: cleanCityId(music?.id, `${id}_bgm_${index + 1}`),
      name: cleanCityText(music?.name, 100),
      resourceRef: cleanCityText(music?.resourceRef, 240),
      audioUrl: cleanCityText(music?.audioUrl, 300),
      originalName: cleanCityText(music?.originalName, 180),
      scope: 'city',
      areaId: '',
      trigger: 'default',
      loop: music?.loop !== false,
      volume: Math.round(Math.min(100, Math.max(0, parseNumber(music?.volume, 70)))),
      fadeSeconds: Math.round(Math.min(30, Math.max(0, parseNumber(music?.fadeSeconds, 1))) * 10) / 10,
      status: cityItemStatuses.has(music?.status) ? music.status : 'planned',
    }))
    return {
      id,
      name: cleanCityText(city?.name, 80),
      spanishName: cleanCityText(city?.spanishName, 80),
      status: cityContentStatuses.has(city?.status) ? city.status : 'planning',
      difficulty: Math.min(5, Math.max(1, Math.round(parseNumber(city?.difficulty, 1)))),
      overview: cleanCityText(city?.overview, 800),
      verticalSlice: cleanCityText(city?.verticalSlice, 800),
      plannedCounts: {
        areas: Math.min(99, Math.max(0, Math.round(parseNumber(city?.plannedCounts?.areas, areas.length)))),
        chests: Math.min(999, Math.max(0, Math.round(parseNumber(city?.plannedCounts?.chests, chests.length)))),
        vocabulary: Math.min(9999, Math.max(0, Math.round(parseNumber(city?.plannedCounts?.vocabulary, vocabulary.length)))),
        pets: Math.min(999, Math.max(0, Math.round(parseNumber(city?.plannedCounts?.pets, pets.length)))),
        games: Math.min(999, Math.max(0, Math.round(parseNumber(city?.plannedCounts?.games, games.length)))),
      },
      areas,
      chests,
      vocabulary,
      gameWordLinks,
      pets,
      games,
      backgroundMusic,
      updatedAt: new Date().toISOString(),
    }
  })
  if (normalizedCities.some((city) => !city.name)) throw new Error('每座城市都必须填写城市名称。')
  for (const city of normalizedCities) {
    const ensureUniqueIds = (items, label) => {
      const ids = items.map((item) => item.id)
      if (new Set(ids).size !== ids.length) throw new Error(`城市“${city.name}”存在重复的${label} ID。`)
    }
    ensureUniqueIds(city.areas, '片区')
    ensureUniqueIds(city.chests, '宝箱')
    ensureUniqueIds(city.vocabulary, '词汇')
    ensureUniqueIds(city.gameWordLinks, '游戏词汇关联')
    ensureUniqueIds(city.pets, '宝箱宠物投放')
    ensureUniqueIds(city.games, '游戏投放')
    ensureUniqueIds(city.backgroundMusic, '背景音乐配置')
    const areaIds = new Set(city.areas.map((area) => area.id))
    const wordIds = new Set(city.vocabulary.map((word) => word.id))
    const gameIds = new Set(city.games.map((game) => game.id))
    const activeChestTypes = new Set(city.chests.map((chest) => chest.type))
    if (city.chests.some((chest) => !areaIds.has(chest.areaId))) throw new Error(`城市“${city.name}”存在未关联有效片区的宝箱。`)
    if (city.vocabulary.some((word) => !word.spanish || !word.english || !word.chinese)) throw new Error(`城市“${city.name}”的每个核心词汇都必须填写西语、英文和中文。`)
    if (new Set(city.vocabulary.map((word) => word.spanish.toLocaleLowerCase())).size !== city.vocabulary.length) throw new Error(`城市“${city.name}”存在重复的西语核心词汇。`)
    if (city.vocabulary.some((word) => word.areaId && !areaIds.has(word.areaId))) throw new Error(`城市“${city.name}”存在未关联有效片区的词汇。`)
    if (city.pets.some((pet) => !chestTypes.has(pet.chestType))) throw new Error(`城市“${city.name}”存在未关联有效宝箱类型的宠物投放。`)
    if (city.pets.some((pet) => !activeChestTypes.has(pet.chestType))) throw new Error(`城市“${city.name}”的宠物投放引用了当前城市尚未出现的宝箱类型。`)
    if (city.gameWordLinks.some((link) => !gameIds.has(link.gameId) || !wordIds.has(link.wordId))) throw new Error(`城市“${city.name}”存在失效的游戏—词汇引用。`)
    if (city.games.some((game) => !chestTypes.has(game.chestType))) throw new Error(`城市“${city.name}”存在未关联有效宝箱类型的游戏投放。`)
    if (city.games.some((game) => !activeChestTypes.has(game.chestType))) throw new Error(`城市“${city.name}”的游戏投放引用了当前城市尚未出现的宝箱类型。`)
    if (new Set(city.pets.map((pet) => `${pet.chestType}:${pet.petContentId}`)).size !== city.pets.length) throw new Error(`城市“${city.name}”同一宝箱类型重复配置了同一只宠物。`)
    if (new Set(city.games.map((game) => `${game.chestType}:${game.gameContentId}`)).size !== city.games.length) throw new Error(`城市“${city.name}”同一宝箱类型重复配置了同一个游戏。`)
    if (city.backgroundMusic.some((music) => !music.name || !music.resourceRef)) throw new Error(`城市“${city.name}”存在未填写音轨名称或音频资源的背景音乐配置。`)
    if (city.status === 'ready' || city.status === 'released') {
      for (const chestType of chestTypes) {
        const entries = city.pets.filter((pet) => pet.enabled && pet.chestType === chestType)
        if (!entries.length) continue
        const total = Math.round(entries.reduce((sum, pet) => sum + pet.weight, 0) * 100) / 100
        if (total !== 100) throw new Error(`城市“${city.name}”的${chestType === 'main' ? '主线' : '隐藏'}宝箱宠物掉落概率合计为 ${total}%，可接入或发布前必须为 100%。`)
      }
      for (const chestType of new Set(city.chests.map((chest) => chest.type))) {
        const gameIdsForType = city.games.filter((game) => game.chestType === chestType).map((game) => game.id)
        const links = city.gameWordLinks.filter((link) => gameIdsForType.includes(link.gameId))
        const newWordCount = links.filter((link) => link.role === 'new').length
        if (chestType === 'main' && (newWordCount < 2 || newWordCount > 4)) throw new Error(`主线宝箱类型必须配置 2–4 个新词。`)
        if (chestType !== 'main' && newWordCount > 0) throw new Error('隐藏宝箱类型不能引入新词，只能复现已学词。')
        if (!gameIdsForType.length) throw new Error(`${chestType === 'main' ? '主线' : '隐藏'}宝箱类型尚未配置语言小游戏。`)
      }
    }
  }
  return { schemaVersion: 6, projectId, updatedAt: new Date().toISOString(), cities: normalizedCities }
}

async function validateCityCatalogReferences(projectId, content) {
  const petContent = existsSync(petContentFile(projectId)) ? normalizePetContent(projectId, JSON.parse(await readFile(petContentFile(projectId), 'utf8'))) : defaultPetContent(projectId)
  const gameContent = existsSync(gameContentFile(projectId)) ? normalizeGameContent(projectId, JSON.parse(await readFile(gameContentFile(projectId), 'utf8'))) : defaultGameContent(projectId)
  const petById = new Map(petContent.pets.map((pet) => [pet.id, pet]))
  const gameById = new Map(gameContent.games.map((game) => [game.id, game]))
  for (const city of content.cities) {
    for (const entry of city.pets) {
      const pet = petById.get(entry.petContentId)
      if (!pet) throw new Error(`城市“${city.name}”引用了不存在的宠物“${entry.petContentId}”。`)
      if ((city.status === 'ready' || city.status === 'released') && pet.status !== 'ready') throw new Error(`宠物“${pet.chineseName}”尚未就绪，城市不能标记为可接入或已发布。`)
    }
    for (const link of city.games) {
      const game = gameById.get(link.gameContentId)
      if (!game) throw new Error(`城市“${city.name}”引用了不存在的游戏“${link.gameContentId}”。`)
      if (link.fallbackGameContentId && !gameById.has(link.fallbackGameContentId)) throw new Error(`游戏投放“${link.id}”的降级游戏不存在。`)
      if ((city.status === 'ready' || city.status === 'released') && game.status !== 'ready') throw new Error(`游戏“${game.name}”尚未就绪，城市不能标记为可接入或已发布。`)
    }
  }
}

function defaultTechnicalStandards() {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    profileId: 'godot-pc-default',
    profileName: 'Godot PC 技术美术基线',
    version: 1,
    updatedAt: now,
    engine: {
      name: 'Godot',
      version: '4.x（待项目确认）',
      renderer: 'Forward+',
      targetPlatform: 'Windows / PC',
      resourceRoot: 'res://art',
      prefabExtension: '.tscn',
    },
    naming: {
      pattern: '^[\\p{L}\\p{N}][\\p{L}\\p{N}_-]{1,59}$',
      example: 'character_girl_idle_v001',
      lowercaseRecommended: true,
      versionSuffix: '_v001',
    },
    import: {
      sourceRoot: 'res://art/source',
      runtimeRoot: 'res://art/runtime',
      characterSceneRoot: 'res://art/characters',
      vfxSceneRoot: 'res://art/vfx',
      uiRoot: 'res://art/ui',
      textureFilter: 'Nearest（像素素材）/ Linear（绘制素材）',
      prefabRule: '一个可复用运行时资产对应一个 .tscn 场景；外部依赖使用相对 res:// 路径。',
      aiHandoffStandardId: 'TA-IMG-001',
      aiResponsibilityRule: '模型、版本、seed、参考图权重、steps、CFG 与批次变量由主视觉或对应美术模块的结构化 Prompt 管理；技术美术规范只定义可入库和运行时接入条件。',
      aiCanvasFormatRule: '概念源图的画布比例与生成尺寸由主视觉定义；进入引擎前必须满足项目允许格式、尺寸上限、色彩空间、纹理上限与平台压缩规则。',
      aiAlphaDeliveryRule: '整幅概念图可不含 Alpha；独立角色、道具、特效和 UI 资产按用途提供透明交付，并在运行时资产清单声明 Alpha 与混合方式。',
      aiImportHandoffRule: 'AI 源图先进入 source 目录；审核、裁切、拆分、缩放和清边后生成 runtime 派生资产。概念图不得直接作为运行时纹理。',
      aiManifestEvidenceRule: '资产清单登记稳定 ID、源图与运行时路径、版本、尺寸、色彩空间、Alpha、过滤、压缩和图集信息；模型、seed、参考图与人工修改记录保存在对应生成证据中。',
      aiPromptReferenceRule: '主视觉和下游模块通过 TA-IMG-001 引用当前接入规范，不复制运行时参数；规范版本变化后重新校验受影响资产。',
    },
    materials: {
      materialPrefix: 'mat_',
      shaderPrefix: 'shd_',
      uniformPrefix: 'u_',
      allowedBlendModes: 'Mix / Add / Premultiplied Alpha',
      shaderRule: '共享 Shader 与实例材质分离；禁止在单个场景中复制同源码 Shader。',
    },
    rigging: {
      maxBoneInfluences: 4,
      minimumWeight: 0.01,
      normalizeWeights: true,
      rootBoneName: 'root',
      deformBoneSuffix: '_def',
      rule: '骨骼命名稳定；蒙皮权重归一化；零权重和孤立顶点必须在导入前清理。',
    },
    animation: {
      defaultSampleFps: 30,
      maxSampleFps: 60,
      maxSequenceFrames: 2000,
      compressionTolerance: 0.01,
      rootMotionRule: '位移动画明确标记原地或 Root Motion；同一角色不得混用未标记方案。',
      loopRule: '循环动画首尾姿态与速度连续；事件轨道不得落在裁剪区间之外。',
    },
    vfx: {
      maxParticlesPerEffect: 500,
      maxConcurrentParticles: 3000,
      maxDrawCallsPerEffect: 8,
      maxTextureSize: 2048,
      maxDurationSeconds: 10,
      rule: '移动端或低配档需单独覆盖预算；透明叠层与全屏粒子必须提供降级方案。',
    },
    validation: {
      allowedImageFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
      allowedVideoFormats: ['mp4', 'webm', 'mov', 'mkv', 'avi'],
      maxSourceFileMB: 250,
      minWidth: 64,
      minHeight: 64,
      maxWidth: 4096,
      maxHeight: 4096,
      requireRuntimeAlphaDeclaration: true,
    },
    revisions: [{ version: 1, updatedAt: now, note: '项目创建时生成的可编辑基线；数值需由团队按目标设备确认。' }],
  }
}

async function loadTechnicalStandards(projectId) {
  const filePath = standardsFile(projectId)
  if (!existsSync(filePath)) {
    const standards = defaultTechnicalStandards()
    await writeJsonAtomic(filePath, standards)
    return standards
  }
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function mergeTechnicalStandards(current, incoming) {
  const editableSections = ['engine', 'naming', 'import', 'materials', 'rigging', 'animation', 'vfx', 'validation']
  const next = { ...current }
  next.profileName = String(incoming.profileName ?? current.profileName).trim().slice(0, 80) || current.profileName
  for (const section of editableSections) {
    if (incoming[section] && typeof incoming[section] === 'object' && !Array.isArray(incoming[section])) {
      next[section] = { ...current[section], ...incoming[section] }
    }
  }
  next.version = Number(current.version || 1) + 1
  next.updatedAt = new Date().toISOString()
  const note = String(incoming.changeNote || '更新项目技术美术规范').trim().slice(0, 160)
  next.revisions = [...(current.revisions || []), { version: next.version, updatedAt: next.updatedAt, note }].slice(-50)
  return next
}

function emptyRegistry(projectId) {
  return { schemaVersion: 1, projectId, updatedAt: new Date().toISOString(), assets: [] }
}

async function readRegistry(projectId) {
  const filePath = registryFile(projectId)
  return existsSync(filePath) ? JSON.parse(await readFile(filePath, 'utf8')) : emptyRegistry(projectId)
}

async function saveRegistry(projectId, registry) {
  registry.updatedAt = new Date().toISOString()
  await writeJsonAtomic(registryFile(projectId), registry)
}

function assetArtifactFromImage(manifest) {
  return {
    sourceKind: 'image',
    sourcePath: manifest.imageUrl,
    outputDirectory: manifest.outputDirectory,
    originalName: manifest.originalName,
    fileName: manifest.fileName,
    extension: extname(manifest.fileName || manifest.originalName || '').replace('.', '').toLowerCase(),
    size: Number(manifest.size || 0),
    width: manifest.width || null,
    height: manifest.height || null,
    pixelFormat: manifest.pixelFormat || null,
    alphaDeclared: typeof manifest.alphaDetected === 'boolean' ? manifest.alphaDetected : null,
  }
}

function assetArtifactFromSequence(manifest) {
  return {
    sourceKind: 'frame-sequence',
    runtimePath: manifest.outputDirectory,
    manifestUrl: manifest.manifestUrl,
    frameUrls: manifest.frameUrls,
    fps: Number(manifest.fps || 0),
    duration: Number(manifest.duration || 0),
    width: Number(manifest.width || 0),
    height: Number(manifest.height || 0),
    frameCount: Number(manifest.frameCount || 0),
    framePattern: manifest.framePattern,
    loop: manifest.playback?.loop ?? true,
  }
}

function validateAssetVersion(asset, version, standards) {
  const checks = []
  const add = (id, label, status, message) => checks.push({ id, label, status, message })
  let namePattern
  try { namePattern = new RegExp(standards.naming.pattern, 'u') } catch { namePattern = /^[\p{L}\p{N}][\p{L}\p{N}_-]{1,59}$/u }
  add('name', '命名规范', namePattern.test(asset.name) ? 'passed' : 'failed', namePattern.test(asset.name) ? `符合 ${standards.naming.pattern}` : `名称需符合 ${standards.naming.pattern}`)
  add('module', '模块映射', asset.moduleId && asset.moduleId !== 'unassigned' ? 'passed' : 'warning', asset.moduleId && asset.moduleId !== 'unassigned' ? `已关联 ${asset.moduleId}` : '尚未指定生产模块。')
  const artifact = version.artifact || {}
  if (artifact.sourceKind === 'image') {
    const allowed = standards.validation.allowedImageFormats.map((item) => String(item).toLowerCase())
    add('format', '图片格式', allowed.includes(String(artifact.extension).toLowerCase()) ? 'passed' : 'failed', `格式 ${artifact.extension || '未知'}；允许 ${allowed.join(', ')}`)
    const maxBytes = Number(standards.validation.maxSourceFileMB) * 1024 * 1024
    add('file-size', '文件大小', artifact.size && artifact.size <= maxBytes ? 'passed' : artifact.size ? 'failed' : 'warning', artifact.size ? `${(artifact.size / 1024 / 1024).toFixed(2)} MB / 上限 ${standards.validation.maxSourceFileMB} MB` : '没有可用的文件大小元数据。')
    if (artifact.width && artifact.height) {
      const dimensionPass = artifact.width >= Number(standards.validation.minWidth) && artifact.height >= Number(standards.validation.minHeight) && artifact.width <= Number(standards.validation.maxWidth) && artifact.height <= Number(standards.validation.maxHeight)
      add('dimensions', '图片尺寸', dimensionPass ? 'passed' : 'failed', `${artifact.width}×${artifact.height} px；范围 ${standards.validation.minWidth}–${standards.validation.maxWidth} × ${standards.validation.minHeight}–${standards.validation.maxHeight}`)
    } else add('dimensions', '图片尺寸', 'warning', '旧素材未保存尺寸元数据；重新上传版本时会自动校验。')
    add('alpha', '透明通道声明', artifact.alphaDeclared === null ? 'warning' : 'passed', artifact.alphaDeclared === null ? '尚未声明运行时是否需要 Alpha。' : `已声明 Alpha：${artifact.alphaDeclared ? '需要' : '不需要'}`)
  } else if (artifact.sourceKind === 'frame-sequence') {
    add('fps', '动画采样帧率', artifact.fps > 0 && artifact.fps <= Number(standards.animation.maxSampleFps) ? 'passed' : 'failed', `${artifact.fps} FPS / 上限 ${standards.animation.maxSampleFps} FPS`)
    add('frames', '序列帧数量', artifact.frameCount > 0 && artifact.frameCount <= Number(standards.animation.maxSequenceFrames) ? 'passed' : 'failed', `${artifact.frameCount} 帧 / 上限 ${standards.animation.maxSequenceFrames} 帧`)
    const dimensionPass = artifact.width >= Number(standards.validation.minWidth) && artifact.height >= Number(standards.validation.minHeight) && artifact.width <= Number(standards.validation.maxWidth) && artifact.height <= Number(standards.validation.maxHeight)
    add('dimensions', '帧尺寸', dimensionPass ? 'passed' : 'failed', `${artifact.width}×${artifact.height} px`)
    add('runtime-path', 'Godot 运行时路径', artifact.runtimePath ? 'passed' : 'failed', artifact.runtimePath || '缺少运行时目录。')
  } else add('source', '源文件', 'failed', '没有可校验的源文件记录。')
  const failed = checks.filter((check) => check.status === 'failed').length
  const warnings = checks.filter((check) => check.status === 'warning').length
  return { status: failed ? 'failed' : 'passed', failed, warnings, checkedAt: new Date().toISOString(), standardsVersion: standards.version, checks }
}

function makeAssetRecord(manifest, artifact, status, standards) {
  const createdAt = manifest.createdAt || new Date().toISOString()
  const version = {
    id: 'v1',
    number: 1,
    status,
    parentVersionId: null,
    changeNote: status === 'confirmed' ? '从既有正式素材登记' : '从既有源素材登记',
    createdAt,
    artifact,
    validation: null,
  }
  const asset = {
    id: manifest.id,
    projectId: manifest.projectId,
    name: manifest.name,
    assetType: artifact.sourceKind,
    moduleId: manifest.moduleId,
    relations: [],
    currentVersionId: version.id,
    officialVersionId: status === 'confirmed' ? version.id : null,
    impactStatus: 'clear',
    impacts: [],
    versions: [version],
    history: [{ type: 'registered', at: createdAt, message: version.changeNote }],
    createdAt,
    updatedAt: createdAt,
  }
  version.validation = validateAssetVersion(asset, version, standards)
  return asset
}

async function ensureAssetRegistry(projectId) {
  const [registry, standards, images, characterSequences, vfxSequences] = await Promise.all([
    readRegistry(projectId),
    loadTechnicalStandards(projectId),
    loadImageAssets(projectId, ''),
    loadCompletedSequences(projectId, 'character-motion'),
    loadCompletedSequences(projectId, 'skill-vfx'),
  ])
  let changed = false
  for (const manifest of images) {
    if (registry.assets.some((asset) => asset.id === manifest.id)) continue
    registry.assets.push(makeAssetRecord(manifest, assetArtifactFromImage(manifest), 'draft', standards))
    changed = true
  }
  for (const manifest of [...characterSequences, ...vfxSequences]) {
    if (registry.assets.some((asset) => asset.id === manifest.id)) continue
    registry.assets.push(makeAssetRecord(manifest, assetArtifactFromSequence(manifest), 'confirmed', standards))
    changed = true
  }
  if (changed || !existsSync(registryFile(projectId))) await saveRegistry(projectId, registry)
  return registry
}

async function registerManifestAsset(projectId, manifest, artifact, initialStatus) {
  const registry = await ensureAssetRegistry(projectId)
  const standards = await loadTechnicalStandards(projectId)
  if (!registry.assets.some((asset) => asset.id === manifest.id)) {
    registry.assets.push(makeAssetRecord(manifest, artifact, initialStatus, standards))
    await saveRegistry(projectId, registry)
  }
}

function getDownstreamModules(moduleIds) {
  const downstream = new Set()
  const queue = [...moduleIds]
  while (queue.length) {
    const current = queue.shift()
    for (const child of dependencyGraph[current] || []) {
      if (downstream.has(child)) continue
      downstream.add(child)
      queue.push(child)
    }
  }
  return downstream
}

async function markAssetsImpacted(projectId, sourceType, sourceIds, reason) {
  const registry = await ensureAssetRegistry(projectId)
  const targetModules = sourceType === 'technical-standards' ? null : getDownstreamModules(sourceIds)
  const now = new Date().toISOString()
  let count = 0
  for (const asset of registry.assets) {
    if (asset.archivedAt || (targetModules && !targetModules.has(asset.moduleId))) continue
    const existing = asset.impacts.some((impact) => !impact.resolvedAt && impact.sourceType === sourceType && JSON.stringify(impact.sourceIds) === JSON.stringify(sourceIds))
    if (existing) continue
    asset.impactStatus = 'review_required'
    asset.impacts.push({ id: `impact-${Date.now()}-${randomUUID().slice(0, 6)}`, sourceType, sourceIds, reason, createdAt: now, resolvedAt: null, resolution: null })
    asset.history.push({ type: 'impact', at: now, message: reason })
    asset.updatedAt = now
    count += 1
  }
  if (count) await saveRegistry(projectId, registry)
  return count
}

async function recordModuleChanges(projectId, changedIds) {
  if (!changedIds.length) return 0
  const projectFolder = getProjectFolder(projectId)
  const revisionPath = join(projectFolder, 'module-revisions.json')
  const state = existsSync(revisionPath) ? JSON.parse(await readFile(revisionPath, 'utf8')) : { schemaVersion: 1, revisions: {} }
  for (const id of changedIds) state.revisions[id] = Number(state.revisions[id] || 0) + 1
  state.updatedAt = new Date().toISOString()
  await writeJsonAtomic(revisionPath, state)
  return markAssetsImpacted(projectId, 'module', changedIds, `上游模块已变更：${changedIds.join('、')}。请复核下游正式资产。`)
}

async function archiveRegistryAsset(projectId, assetId, message) {
  const registry = await ensureAssetRegistry(projectId)
  const asset = registry.assets.find((item) => item.id === assetId)
  if (!asset) return
  const now = new Date().toISOString()
  asset.archivedAt = now
  asset.updatedAt = now
  for (const version of asset.versions) {
    if (version.status !== 'deprecated') version.status = 'deprecated'
    version.artifact = { ...version.artifact, deletedAt: now }
  }
  asset.history.push({ type: 'archived', at: now, message })
  await saveRegistry(projectId, registry)
}

app.get('/api/projects', async (_request, response) => {
  response.json(await listProjects())
})

app.post('/api/system/select-folder', async (_request, response) => {
  try {
    const selectedPath = await selectFolderWithSystemDialog()
    response.json(selectedPath ? { path: normalizeAssetStoragePath(selectedPath), cancelled: false } : { path: '', cancelled: true })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : '无法选择素材目录。' })
  }
})

app.post('/api/projects', async (request, response) => {
  try {
    const name = String(request.body.name || '').trim()
    if (!name) throw new Error('请输入项目名称。')
    if (name.length > 60) throw new Error('项目名称不能超过 60 个字符。')
    const assetStorageBasePath = normalizeAssetStoragePath(request.body.assetStorageBasePath || request.body.assetStoragePath)
    if (!assetStorageBasePath) throw new Error('请先选择此项目的美术素材存放位置。')
    const baseStats = await stat(assetStorageBasePath)
    if (!baseStats.isDirectory()) throw new Error('所选素材存放位置不是文件夹。')
    const id = `project-${Date.now()}-${randomUUID().slice(0, 8)}`
    const assetStoragePath = join(assetStorageBasePath, 'ArtFlow', `${cleanFolderSegment(name)}-${id.slice(-8)}`)
    const existingProjects = await listProjects()
    if (existingProjects.some((project) => samePath(project.assetStoragePath, assetStoragePath))) {
      throw new Error('该项目素材目录已存在，请重新选择存放位置。')
    }
    const project = await createProjectRecord({ id, name, description: request.body.description, assetStoragePath, assetStorageBasePath })
    response.status(201).json(await decorateProject(project))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '项目创建失败。' })
  }
})

app.delete('/api/projects/:projectId', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    if (projectId === defaultProjectId) throw new Error('默认项目不能删除。')
    const projectFolder = getProjectFolder(projectId)
    if (!existsSync(join(projectFolder, 'project.json'))) return response.status(404).json({ error: '项目不存在。' })
    const project = await readProject(projectId)
    const preservedAssetStoragePath = project.assetStoragePath || ''
    await rm(projectFolder, { recursive: true, force: true })
    response.json({ ok: true, id: projectId, preservedAssetStoragePath })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '项目删除失败。' })
  }
})

app.get('/api/projects/:projectId/modules', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const modulesPath = join(getProjectFolder(projectId), 'modules.json')
    if (!existsSync(modulesPath)) return response.json({ modules: null })
    response.json({ modules: JSON.parse(await readFile(modulesPath, 'utf8')) })
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '项目不存在。' })
  }
})

app.put('/api/projects/:projectId/modules', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    if (!Array.isArray(request.body.modules) || request.body.modules.length > 50) throw new Error('模块配置格式无效。')
    const projectFolder = getProjectFolder(projectId)
    const modulesPath = join(projectFolder, 'modules.json')
    const previousModules = existsSync(modulesPath) ? JSON.parse(await readFile(modulesPath, 'utf8')) : null
    const changedIds = previousModules
      ? request.body.modules.filter((module) => {
          const previous = previousModules.find((item) => item.id === module.id)
          return previous && JSON.stringify(previous) !== JSON.stringify(module)
        }).map((module) => module.id)
      : []
    const tempPath = join(projectFolder, `modules-${randomUUID().slice(0, 8)}.tmp`)
    await writeFile(tempPath, `${JSON.stringify(request.body.modules, null, 2)}\n`, 'utf8')
    await rename(tempPath, modulesPath)
    project.updatedAt = new Date().toISOString()
    await writeFile(join(projectFolder, 'project.json'), `${JSON.stringify(project, null, 2)}\n`, 'utf8')
    const impactedAssets = await recordModuleChanges(projectId, changedIds)
    response.json({ ok: true, updatedAt: project.updatedAt, changedModules: changedIds, impactedAssets })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '模块配置保存失败。' })
  }
})

app.get('/api/projects/:projectId/plan', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const filePath = projectPlanFile(projectId)
    response.json(existsSync(filePath) ? JSON.parse(await readFile(filePath, 'utf8')) : defaultProjectPlan(projectId))
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '项目计划读取失败。' })
  }
})

app.put('/api/projects/:projectId/plan', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    const plan = normalizeProjectPlan(projectId, request.body.plan)
    await writeJsonAtomic(projectPlanFile(projectId), plan)
    project.updatedAt = plan.updatedAt
    await writeJsonAtomic(join(getProjectFolder(projectId), 'project.json'), project)
    response.json({ ok: true, plan })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '项目计划保存失败。' })
  }
})

app.get('/api/projects/:projectId/main-visual-deliverables', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const filePath = mainVisualDeliverablesFile(projectId)
    const value = existsSync(filePath) ? JSON.parse(await readFile(filePath, 'utf8')) : defaultMainVisualDeliverables(projectId)
    response.json(normalizeMainVisualDeliverables(projectId, value))
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '主视觉交付物记录读取失败。' })
  }
})

app.put('/api/projects/:projectId/main-visual-deliverables', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    const deliverables = normalizeMainVisualDeliverables(projectId, request.body.deliverables, String(request.body.validationItemId || ''))
    await writeJsonAtomic(mainVisualDeliverablesFile(projectId), deliverables)
    project.updatedAt = deliverables.updatedAt
    await writeJsonAtomic(join(getProjectFolder(projectId), 'project.json'), project)
    response.json({ ok: true, deliverables })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '主视觉交付物记录保存失败。' })
  }
})

app.get('/api/projects/:projectId/character-setting-sheets', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const filePath = characterSettingSheetsFile(projectId)
    const value = existsSync(filePath) ? JSON.parse(await readFile(filePath, 'utf8')) : defaultCharacterSettingSheets(projectId)
    response.json(normalizeCharacterSettingSheets(projectId, value))
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '角色设定表读取失败。' })
  }
})

app.put('/api/projects/:projectId/character-setting-sheets', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    const sheets = normalizeCharacterSettingSheets(projectId, request.body.sheets)
    await writeJsonAtomic(characterSettingSheetsFile(projectId), sheets)
    project.updatedAt = sheets.updatedAt
    await writeJsonAtomic(join(getProjectFolder(projectId), 'project.json'), project)
    response.json({ ok: true, sheets })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '角色设定表保存失败。' })
  }
})

app.get('/api/projects/:projectId/city-content', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const filePath = cityContentFile(projectId)
    response.json(existsSync(filePath) ? normalizeCityContent(projectId, JSON.parse(await readFile(filePath, 'utf8'))) : defaultCityContent(projectId))
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '城市内容读取失败。' })
  }
})

app.put('/api/projects/:projectId/city-content', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    const content = normalizeCityContent(projectId, request.body.content)
    await validateCityCatalogReferences(projectId, content)
    await writeJsonAtomic(cityContentFile(projectId), content)
    project.updatedAt = content.updatedAt
    await writeJsonAtomic(join(getProjectFolder(projectId), 'project.json'), project)
    response.json({ ok: true, content })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '城市内容保存失败。' })
  }
})

app.post('/api/projects/:projectId/cities/:cityId/background-music', audioUpload.single('audio'), async (request, response) => {
  const file = request.file
  if (!file) return response.status(400).json({ error: '请选择 MP3、WAV、OGG、M4A、AAC 或 FLAC 音频文件。' })
  let targetFolder = ''
  try {
    const projectId = assertProjectId(request.params.projectId)
    const cityId = cleanCityId(request.params.cityId, '')
    const musicId = cleanCityId(request.body.musicId, '')
    if (!cityId || !musicId) throw new Error('城市或背景音乐配置 ID 无效。')
    await readProject(projectId)
    const extension = extname(file.originalname).toLowerCase()
    if (!supportedAudioExtensions.has(extension)) throw new Error('音频格式不受支持。')
    const assetRoot = await getProjectAssetFolder(projectId)
    targetFolder = join(assetRoot, 'assets', 'source', 'city-background-music', cityId, musicId)
    await rm(targetFolder, { recursive: true, force: true })
    await mkdir(targetFolder, { recursive: true })
    const fileName = `source${extension}`
    await rename(file.path, join(targetFolder, fileName))
    const resourceRef = `assets/source/city-background-music/${cityId}/${musicId}/${fileName}`
    const audioUrl = `/project-assets/${projectId}/${resourceRef}`
    await writeFile(join(targetFolder, 'audio.json'), `${JSON.stringify({ schemaVersion: 1, projectId, cityId, musicId, originalName: normalizeUploadedFileName(file.originalname), fileName, size: file.size, createdAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
    response.status(201).json({ music: { resourceRef, audioUrl, originalName: normalizeUploadedFileName(file.originalname) } })
  } catch (error) {
    if (file.path && existsSync(file.path)) await rm(file.path, { force: true })
    if (targetFolder) await rm(targetFolder, { recursive: true, force: true })
    response.status(400).json({ error: error instanceof Error ? error.message : '背景音乐上传失败。' })
  }
})

app.delete('/api/projects/:projectId/cities/:cityId/background-music/:musicId', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const cityId = cleanCityId(request.params.cityId, '')
    const musicId = cleanCityId(request.params.musicId, '')
    if (!cityId || !musicId) throw new Error('城市或背景音乐配置 ID 无效。')
    await readProject(projectId)
    const folder = join(await getProjectAssetFolder(projectId), 'assets', 'source', 'city-background-music', cityId, musicId)
    await rm(folder, { recursive: true, force: true })
    response.json({ ok: true })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '背景音乐删除失败。' })
  }
})

app.get('/api/projects/:projectId/pet-content', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const filePath = petContentFile(projectId)
    response.json(existsSync(filePath) ? normalizePetContent(projectId, JSON.parse(await readFile(filePath, 'utf8'))) : defaultPetContent(projectId))
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '宠物内容读取失败。' })
  }
})

app.put('/api/projects/:projectId/pet-content', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    const content = normalizePetContent(projectId, request.body.content)
    await writeJsonAtomic(petContentFile(projectId), content)
    project.updatedAt = content.updatedAt
    await writeJsonAtomic(join(getProjectFolder(projectId), 'project.json'), project)
    response.json({ ok: true, content })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '宠物内容保存失败。' })
  }
})

app.get('/api/projects/:projectId/game-content', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    await readProject(projectId)
    const filePath = gameContentFile(projectId)
    response.json(existsSync(filePath) ? JSON.parse(await readFile(filePath, 'utf8')) : defaultGameContent(projectId))
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : '游戏内容读取失败。' })
  }
})

app.put('/api/projects/:projectId/game-content', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    const project = await readProject(projectId)
    const content = normalizeGameContent(projectId, request.body.content)
    await writeJsonAtomic(gameContentFile(projectId), content)
    project.updatedAt = content.updatedAt
    await writeJsonAtomic(join(getProjectFolder(projectId), 'project.json'), project)
    response.json({ ok: true, content })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '游戏内容保存失败。' })
  }
})

app.get('/api/asset-registry', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    await readProject(projectId)
    const registry = await ensureAssetRegistry(projectId)
    const activeAssets = registry.assets.filter((asset) => !asset.archivedAt)
    response.json({
      ...registry,
      assets: activeAssets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      summary: {
        total: activeAssets.length,
        draft: activeAssets.filter((asset) => asset.versions.find((version) => version.id === asset.currentVersionId)?.status === 'draft').length,
        inReview: activeAssets.filter((asset) => asset.versions.find((version) => version.id === asset.currentVersionId)?.status === 'in_review').length,
        confirmed: activeAssets.filter((asset) => asset.officialVersionId).length,
        impacted: activeAssets.filter((asset) => asset.impactStatus === 'review_required').length,
      },
    })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取资产注册表。' })
  }
})

app.get('/api/asset-registry/:assetId', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    const assetId = String(request.params.assetId || '')
    if (!/^[a-z0-9][a-z0-9-]{2,140}$/i.test(assetId)) throw new Error('无效的资产 ID。')
    const registry = await ensureAssetRegistry(projectId)
    const asset = registry.assets.find((item) => item.id === assetId && !item.archivedAt)
    if (!asset) return response.status(404).json({ error: '资产不存在。' })
    response.json(asset)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取资产。' })
  }
})

app.post('/api/asset-registry/:assetId/versions', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    const registry = await ensureAssetRegistry(projectId)
    const asset = registry.assets.find((item) => item.id === request.params.assetId && !item.archivedAt)
    if (!asset) return response.status(404).json({ error: '资产不存在。' })
    const source = asset.versions.find((version) => version.id === asset.currentVersionId)
    if (!source) throw new Error('当前资产版本不存在。')
    const number = Math.max(...asset.versions.map((version) => Number(version.number || 0))) + 1
    const now = new Date().toISOString()
    const version = {
      id: `v${number}`,
      number,
      status: 'draft',
      parentVersionId: source.id,
      changeNote: String(request.body.changeNote || `基于 ${source.id} 创建工作版本`).trim().slice(0, 160),
      createdAt: now,
      artifact: structuredClone(source.artifact),
      validation: null,
    }
    const standards = await loadTechnicalStandards(projectId)
    version.validation = validateAssetVersion(asset, version, standards)
    asset.versions.push(version)
    asset.currentVersionId = version.id
    asset.updatedAt = now
    asset.history.push({ type: 'version-created', at: now, message: `${version.id}：${version.changeNote}` })
    for (const impact of asset.impacts) {
      if (!impact.resolvedAt) {
        impact.resolvedAt = now
        impact.resolution = `已创建 ${version.id} 处理上游变更`
      }
    }
    asset.impactStatus = 'clear'
    await saveRegistry(projectId, registry)
    response.status(201).json(asset)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '创建资产版本失败。' })
  }
})

app.post('/api/asset-registry/:assetId/status', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    const nextStatus = String(request.body.status || '')
    if (!assetLifecycleStatuses.has(nextStatus)) throw new Error('无效的资产状态。')
    const registry = await ensureAssetRegistry(projectId)
    const asset = registry.assets.find((item) => item.id === request.params.assetId && !item.archivedAt)
    if (!asset) return response.status(404).json({ error: '资产不存在。' })
    const version = asset.versions.find((item) => item.id === String(request.body.versionId || asset.currentVersionId))
    if (!version) throw new Error('资产版本不存在。')
    const transitions = { draft: ['in_review'], in_review: ['draft', 'confirmed'], confirmed: ['deprecated'], deprecated: ['draft'] }
    if (!(transitions[version.status] || []).includes(nextStatus)) throw new Error(`不能从 ${version.status} 直接变更为 ${nextStatus}。`)
    const standards = await loadTechnicalStandards(projectId)
    version.validation = validateAssetVersion(asset, version, standards)
    if ((nextStatus === 'in_review' || nextStatus === 'confirmed') && version.validation.status !== 'passed') {
      throw new Error('自动校验未通过，不能提交审核或确认。')
    }
    const now = new Date().toISOString()
    version.status = nextStatus
    version.statusUpdatedAt = now
    if (nextStatus === 'confirmed') asset.officialVersionId = version.id
    if (nextStatus === 'deprecated' && asset.officialVersionId === version.id) asset.officialVersionId = null
    asset.updatedAt = now
    asset.history.push({ type: 'status-changed', at: now, message: `${version.id}：${nextStatus}` })
    await saveRegistry(projectId, registry)
    response.json(asset)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '资产状态更新失败。' })
  }
})

app.put('/api/asset-registry/:assetId/relations', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    if (!Array.isArray(request.body.relations) || request.body.relations.length > 50) throw new Error('资产关联格式无效。')
    const relations = request.body.relations.map((relation) => {
      const type = String(relation.type || 'other')
      const id = String(relation.id || '').trim().slice(0, 80)
      if (!assetRelationTypes.has(type) || !id) throw new Error('每条关联都需要合法的类型和对象 ID。')
      return { type, id, name: String(relation.name || '').trim().slice(0, 80), usage: String(relation.usage || '').trim().slice(0, 160) }
    })
    const registry = await ensureAssetRegistry(projectId)
    const asset = registry.assets.find((item) => item.id === request.params.assetId && !item.archivedAt)
    if (!asset) return response.status(404).json({ error: '资产不存在。' })
    asset.relations = relations
    asset.updatedAt = new Date().toISOString()
    asset.history.push({ type: 'relations-updated', at: asset.updatedAt, message: `更新 ${relations.length} 条对象关联` })
    await saveRegistry(projectId, registry)
    response.json(asset)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '资产关联更新失败。' })
  }
})

app.post('/api/asset-registry/:assetId/validate', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    const registry = await ensureAssetRegistry(projectId)
    const standards = await loadTechnicalStandards(projectId)
    const asset = registry.assets.find((item) => item.id === request.params.assetId && !item.archivedAt)
    if (!asset) return response.status(404).json({ error: '资产不存在。' })
    const version = asset.versions.find((item) => item.id === String(request.body.versionId || asset.currentVersionId))
    if (!version) throw new Error('资产版本不存在。')
    version.validation = validateAssetVersion(asset, version, standards)
    asset.updatedAt = new Date().toISOString()
    asset.history.push({ type: 'validated', at: asset.updatedAt, message: `${version.id} 使用规范 v${standards.version} 校验：${version.validation.status}` })
    await saveRegistry(projectId, registry)
    response.json(asset)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '自动校验失败。' })
  }
})

app.post('/api/asset-registry/:assetId/impact/acknowledge', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    const registry = await ensureAssetRegistry(projectId)
    const asset = registry.assets.find((item) => item.id === request.params.assetId && !item.archivedAt)
    if (!asset) return response.status(404).json({ error: '资产不存在。' })
    const now = new Date().toISOString()
    const resolution = String(request.body.resolution || '已人工复核，当前版本无需修改').trim().slice(0, 160)
    for (const impact of asset.impacts) {
      if (!impact.resolvedAt) {
        impact.resolvedAt = now
        impact.resolution = resolution
      }
    }
    asset.impactStatus = 'clear'
    asset.updatedAt = now
    asset.history.push({ type: 'impact-acknowledged', at: now, message: resolution })
    await saveRegistry(projectId, registry)
    response.json(asset)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '影响复核失败。' })
  }
})

app.get('/api/technical-standards', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    await readProject(projectId)
    response.json(await loadTechnicalStandards(projectId))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取技术美术规范。' })
  }
})

app.put('/api/technical-standards', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    await readProject(projectId)
    const current = await loadTechnicalStandards(projectId)
    const next = mergeTechnicalStandards(current, request.body.standards || {})
    await writeJsonAtomic(standardsFile(projectId), next)
    const impactedAssets = await markAssetsImpacted(projectId, 'technical-standards', [`v${next.version}`], `技术美术规范更新至 v${next.version}，请按新标准重新校验。`)
    response.json({ standards: next, impactedAssets })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '技术美术规范保存失败。' })
  }
})

app.get('/api/image-assets', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    await readProject(projectId)
    const moduleId = String(request.query.moduleId || '')
    if (moduleId && !assetModules.has(moduleId)) throw new Error('不支持的素材模块。')
    response.json(await loadImageAssets(projectId, moduleId))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取图片素材。' })
  }
})

app.post('/api/image-assets', imageUpload.array('images', 12), async (request, response) => {
  const files = request.files || []
  if (files.length === 0) return response.status(400).json({ error: '请选择 PNG、JPG、WebP 或 GIF 图片。' })
  const createdFolders = []
  try {
    const projectId = assertProjectId(request.body.projectId)
    await readProject(projectId)
    const moduleId = String(request.body.moduleId || 'unassigned')
    if (!assetModules.has(moduleId)) throw new Error('不支持的素材模块。')
    const titlePrefix = cleanName(request.body.name)
    const assetRoot = await getProjectAssetFolder(projectId)
    const created = []
    for (const [index, file] of files.entries()) {
      const extension = extname(file.originalname).toLowerCase()
      if (!supportedImageExtensions.has(extension)) throw new Error('图片格式不受支持。')
      const id = `asset-${Date.now()}-${randomUUID().slice(0, 8)}`
      const assetFolder = join(assetRoot, 'assets', 'source', moduleId, id)
      createdFolders.push(assetFolder)
      await mkdir(assetFolder, { recursive: true })
      const fileName = `source${extension}`
      const storedFilePath = join(assetFolder, fileName)
      await rename(file.path, storedFilePath)
      const imageMetadata = await probeImage(storedFilePath)
      const manifest = {
        schemaVersion: 1,
        id,
        projectId,
        moduleId,
        name: files.length > 1 ? `${titlePrefix} ${index + 1}` : titlePrefix,
        createdAt: new Date().toISOString(),
        originalName: normalizeUploadedFileName(file.originalname),
        fileName,
        size: file.size,
        width: imageMetadata.width,
        height: imageMetadata.height,
        pixelFormat: imageMetadata.pixelFormat,
        alphaDetected: imageMetadata.alphaDetected,
        status: 'source',
        outputDirectory: assetFolder,
      }
      await writeFile(join(assetFolder, 'asset.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      const publicManifest = { ...manifest, imageUrl: `/project-assets/${projectId}/assets/source/${moduleId}/${id}/${fileName}` }
      await registerManifestAsset(projectId, publicManifest, assetArtifactFromImage(publicManifest), 'draft')
      created.push(publicManifest)
    }
    response.status(201).json(created)
  } catch (error) {
    for (const file of files) if (file.path && existsSync(file.path)) await rm(file.path, { force: true })
    for (const folder of createdFolders) await rm(folder, { recursive: true, force: true })
    response.status(400).json({ error: error instanceof Error ? error.message : '图片上传失败。' })
  }
})

app.delete('/api/image-assets/:moduleId/:assetId', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    const moduleId = String(request.params.moduleId || '')
    const assetId = String(request.params.assetId || '')
    if (!assetModules.has(moduleId) || !/^asset-\d{13}-[a-f0-9]{8}$/i.test(assetId)) throw new Error('无效的图片素材。')
    const assetFolder = join(await getProjectAssetFolder(projectId), 'assets', 'source', moduleId, assetId)
    const manifestPath = join(assetFolder, 'asset.json')
    if (!existsSync(manifestPath)) return response.status(404).json({ error: '图片素材不存在。' })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.projectId !== projectId) throw new Error('图片素材不属于当前项目。')
    await archiveRegistryAsset(projectId, assetId, '源图片文件已从项目中删除')
    await rm(assetFolder, { recursive: true, force: true })
    response.json({ ok: true, id: assetId })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '图片删除失败。' })
  }
})

app.get('/api/frame-sequences', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    await readProject(projectId)
    const moduleId = String(request.query.moduleId || '')
    const petId = String(request.query.petId || '').trim()
    if (moduleId && !supportedModules.has(moduleId)) throw new Error('不支持的模块。')
    if (petId && moduleId !== 'pet-content') throw new Error('宠物序列帧只能在宠物内容管理中读取。')
    response.json(await loadManifests(projectId, moduleId, petId))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取序列帧。' })
  }
})

app.get('/api/completed-sequences', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    await readProject(projectId)
    const moduleId = String(request.query.moduleId || '')
    if (!supportedModules.has(moduleId)) throw new Error('不支持读取此模块的正式序列帧素材。')
    response.json(await loadCompletedSequences(projectId, moduleId))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取已完成素材。' })
  }
})

app.delete('/api/completed-sequences/:moduleId/:assetId', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    const moduleId = String(request.params.moduleId || '')
    const assetId = String(request.params.assetId || '')
    if (!supportedModules.has(moduleId) || !/^completed-\d{13}-[a-f0-9]{8}$/i.test(assetId)) throw new Error('无效的正式序列帧素材。')

    const assetFolder = join(await getProjectAssetFolder(projectId), 'assets', 'runtime', moduleId, assetId)
    const manifestPath = join(assetFolder, 'asset.json')
    if (!existsSync(manifestPath)) return response.status(404).json({ error: '正式序列帧素材不存在。' })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.projectId !== projectId || manifest.moduleId !== moduleId || manifest.id !== assetId || manifest.assetType !== 'frame-sequence') {
      throw new Error('正式序列帧素材不属于当前项目。')
    }
    await archiveRegistryAsset(projectId, assetId, '正式序列帧文件已从项目中删除')
    await rm(assetFolder, { recursive: true, force: true })
    response.json({ ok: true, id: assetId })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '删除正式序列帧素材失败。' })
  }
})

app.post('/api/frame-sequences/:id/promote', async (request, response) => {
  let assetFolder
  try {
    const projectId = assertProjectId(request.body.projectId)
    await readProject(projectId)
    const sequenceId = String(request.params.id || '')
    if (!/^\d{8}T\d{6}-[a-f0-9]{8}$/i.test(sequenceId)) throw new Error('无效的序列帧 ID。')
    const name = String(request.body.name || '').trim().slice(0, 60)
    if (!name) throw new Error('请输入正式素材名称。')

    const assetRoot = await getProjectAssetFolder(projectId)
    const sequenceFolder = join(assetRoot, 'frame-sequences', sequenceId)
    const sequenceManifestPath = join(sequenceFolder, 'manifest.json')
    if (!existsSync(sequenceManifestPath)) return response.status(404).json({ error: '序列帧不存在。' })
    const source = JSON.parse(await readFile(sequenceManifestPath, 'utf8'))
    if (source.projectId !== projectId || !supportedModules.has(source.moduleId)) throw new Error('序列帧不属于当前项目。')

    const id = `completed-${Date.now()}-${randomUUID().slice(0, 8)}`
    assetFolder = join(assetRoot, 'assets', 'runtime', source.moduleId, id)
    await mkdir(assetFolder, { recursive: true })
    await cp(join(sequenceFolder, 'frames'), join(assetFolder, 'frames'), { recursive: true })

    const manifest = {
      schemaVersion: 1,
      assetType: 'frame-sequence',
      status: 'completed',
      id,
      projectId,
      moduleId: source.moduleId,
      ...(source.petId ? { petId: source.petId } : {}),
      name,
      createdAt: new Date().toISOString(),
      sourceSequenceId: source.id,
      sourceSequenceName: source.name,
      outputDirectory: assetFolder,
      fps: source.fps,
      duration: source.duration,
      width: source.width,
      height: source.height,
      frameCount: source.frameCount,
      framePattern: source.framePattern,
      frames: source.frames,
      playback: { loop: true, fps: source.fps },
    }
    await writeFile(join(assetFolder, 'asset.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    const publicManifest = toPublicCompletedSequence(manifest)
    await registerManifestAsset(projectId, publicManifest, assetArtifactFromSequence(publicManifest), 'confirmed')
    response.status(201).json(publicManifest)
  } catch (error) {
    if (assetFolder) await rm(assetFolder, { recursive: true, force: true })
    response.status(400).json({ error: error instanceof Error ? error.message : '保存正式素材失败。' })
  }
})

app.post('/api/frame-sequences/upload-images', frameImageUpload.array('frames', 2000), async (request, response) => {
  const uploadedFiles = request.files || []
  if (uploadedFiles.length === 0) return response.status(400).json({ error: '请选择至少一张 PNG 序列帧。' })

  let sequenceFolder
  try {
    const projectId = assertProjectId(request.body.projectId)
    await readProject(projectId)
    const moduleId = String(request.body.moduleId || '')
    const petId = String(request.body.petId || '').trim()
    if (moduleId !== 'pet-content' || !petId) throw new Error('直接上传序列帧只能关联到已保存的宠物。')
    await assertPetExists(projectId, petId)

    const fps = parseNumber(request.body.fps, 12)
    if (fps < 1 || fps > 60) throw new Error('采样帧率必须在 1 到 60 FPS 之间。')
    if (uploadedFiles.length > 2000) throw new Error('单次最多上传 2000 张序列帧。')
    const orderedFiles = [...uploadedFiles].sort((left, right) => normalizeUploadedFileName(left.originalname).localeCompare(normalizeUploadedFileName(right.originalname), undefined, { numeric: true, sensitivity: 'base' }))
    const metadata = await probeImage(orderedFiles[0].path)
    const id = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}-${randomUUID().slice(0, 8)}`
    sequenceFolder = join(await getProjectAssetFolder(projectId), 'frame-sequences', id)
    const framesFolder = join(sequenceFolder, 'frames')
    await mkdir(framesFolder, { recursive: true })
    const frames = []
    for (const [index, file] of orderedFiles.entries()) {
      const frameName = `frame_${String(index + 1).padStart(4, '0')}.png`
      await rename(file.path, join(framesFolder, frameName))
      frames.push(frameName)
    }

    const manifest = {
      schemaVersion: 1,
      id,
      projectId,
      moduleId,
      petId,
      sourceType: 'uploaded-png-sequence',
      name: cleanName(request.body.name),
      createdAt: new Date().toISOString(),
      sourceOriginalName: `直接上传 PNG 序列帧（${frames.length} 张）`,
      sourceFile: '',
      outputDirectory: framesFolder,
      fps,
      startTime: 0,
      endTime: frames.length / fps,
      duration: frames.length / fps,
      sourceDuration: frames.length / fps,
      width: metadata.width,
      height: metadata.height,
      sourceFrameRate: fps,
      frameCount: frames.length,
      framePattern: 'frame_%04d.png',
      frames,
    }
    await writeFile(join(sequenceFolder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    response.status(201).json(toPublicManifest(manifest))
  } catch (error) {
    await Promise.all(uploadedFiles.map((file) => existsSync(file.path) ? rm(file.path, { force: true }) : Promise.resolve()))
    if (sequenceFolder) await rm(sequenceFolder, { recursive: true, force: true })
    response.status(400).json({ error: error instanceof Error ? error.message : 'PNG 序列帧上传失败。' })
  }
})

app.post('/api/frame-sequences', upload.single('video'), async (request, response) => {
  const uploadedFile = request.file
  if (!uploadedFile) return response.status(400).json({ error: '请选择一个受支持的视频文件。' })

  let sequenceFolder
  try {
    const projectId = assertProjectId(request.body.projectId)
    await readProject(projectId)
    const moduleId = String(request.body.moduleId || '')
    if (!supportedModules.has(moduleId)) throw new Error('不支持在此模块中制作序列帧。')
    const petId = String(request.body.petId || '').trim()
    if (moduleId === 'pet-content') {
      if (!petId) throw new Error('请选择要关联序列帧的宠物。')
      await assertPetExists(projectId, petId)
    } else if (petId) throw new Error('只有宠物内容管理可以关联宠物序列帧。')

    const fps = parseNumber(request.body.fps, 12)
    const startTime = parseNumber(request.body.startTime, 0)
    const requestedEndTime = String(request.body.endTime || '').trim()
    const endTime = requestedEndTime ? parseNumber(requestedEndTime, 0) : null
    if (fps < 1 || fps > 60) throw new Error('采样帧率必须在 1 到 60 FPS 之间。')
    if (startTime < 0) throw new Error('开始时间不能小于 0。')
    if (endTime !== null && endTime <= startTime) throw new Error('结束时间必须晚于开始时间。')

    const extension = extname(uploadedFile.originalname).toLowerCase() || '.mp4'
    if (!supportedExtensions.has(extension)) throw new Error('支持 MP4、WebM、MOV、MKV 和 AVI 视频。')

    const metadata = await probeVideo(uploadedFile.path)
    if (metadata.duration <= 0) throw new Error('无法读取视频时长。')
    if (startTime >= metadata.duration) throw new Error('开始时间超出了视频时长。')
    const effectiveEnd = Math.min(endTime ?? metadata.duration, metadata.duration)
    const selectionDuration = effectiveEnd - startTime
    const estimatedFrames = Math.ceil(selectionDuration * fps)
    if (estimatedFrames > 2000) throw new Error(`预计生成 ${estimatedFrames} 帧，超过单次 2000 帧限制。请降低帧率或缩短范围。`)

    const id = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}-${randomUUID().slice(0, 8)}`
    const sequencesRoot = join(await getProjectAssetFolder(projectId), 'frame-sequences')
    sequenceFolder = join(sequencesRoot, id)
    const framesFolder = join(sequenceFolder, 'frames')
    await mkdir(framesFolder, { recursive: true })
    const sourceFile = `source${extension}`
    const sourcePath = join(sequenceFolder, sourceFile)
    await rename(uploadedFile.path, sourcePath)

    const ffmpegArgs = ['-hide_banner', '-loglevel', 'error', '-ss', String(startTime), '-i', sourcePath]
    if (effectiveEnd < metadata.duration || endTime !== null) ffmpegArgs.push('-t', String(selectionDuration))
    ffmpegArgs.push('-vf', `fps=${fps},format=rgba`, '-start_number', '1', join(framesFolder, 'frame_%04d.png'))
    await run('ffmpeg', ffmpegArgs)

    const frames = (await readdir(framesFolder)).filter((name) => /^frame_\d{4}\.png$/i.test(name)).sort()
    if (frames.length === 0) throw new Error('FFmpeg 没有生成任何序列帧。')

    const manifest = {
      schemaVersion: 1,
      id,
      projectId,
      moduleId,
      ...(petId ? { petId } : {}),
      sourceType: 'video-to-frames',
      name: cleanName(request.body.name),
      createdAt: new Date().toISOString(),
      sourceOriginalName: uploadedFile.originalname,
      sourceFile,
      outputDirectory: framesFolder,
      fps,
      startTime,
      endTime: effectiveEnd,
      duration: selectionDuration,
      sourceDuration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      sourceFrameRate: metadata.sourceFrameRate,
      frameCount: frames.length,
      framePattern: 'frame_%04d.png',
      frames,
    }
    await writeFile(join(sequenceFolder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    response.status(201).json(toPublicManifest(manifest))
  } catch (error) {
    if (uploadedFile?.path && existsSync(uploadedFile.path)) await rm(uploadedFile.path, { force: true })
    if (sequenceFolder) await rm(sequenceFolder, { recursive: true, force: true })
    response.status(400).json({ error: error instanceof Error ? error.message : '序列帧制作失败。' })
  }
})

app.put('/api/frame-sequences/:id/parameters', async (request, response) => {
  try {
    const projectId = assertProjectId(request.body.projectId)
    const id = String(request.params.id || '')
    if (!/^\d{8}T\d{6}-[a-f0-9]{8}$/i.test(id)) throw new Error('无效的序列帧 ID。')
    const manifestPath = join(await getProjectAssetFolder(projectId), 'frame-sequences', id, 'manifest.json')
    if (!existsSync(manifestPath)) return response.status(404).json({ error: '序列帧不存在。' })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.projectId !== projectId || manifest.moduleId !== 'pet-content' || !manifest.petId) throw new Error('只允许编辑宠物动态素材参数。')
    manifest.animationParameters = normalizeAnimationParameters(request.body.animationParameters)
    manifest.updatedAt = new Date().toISOString()
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    response.json(toPublicManifest(manifest))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '动态素材参数保存失败。' })
  }
})

app.delete('/api/frame-sequences/:id', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    const id = String(request.params.id || '')
    if (!/^\d{8}T\d{6}-[a-f0-9]{8}$/i.test(id)) throw new Error('无效的序列帧 ID。')
    const sequenceFolder = join(await getProjectAssetFolder(projectId), 'frame-sequences', id)
    const manifestPath = join(sequenceFolder, 'manifest.json')
    if (!existsSync(manifestPath)) return response.status(404).json({ error: '序列帧不存在。' })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.projectId !== projectId) throw new Error('序列帧不属于当前项目。')
    await rm(sequenceFolder, { recursive: true, force: true })
    response.json({ ok: true, id })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '删除失败。' })
  }
})

app.get('/api/health', async (_request, response) => {
  response.json({ ok: true, ffmpeg: true, projects: (await listProjects()).length })
})

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: '上传文件超过当前类型的大小限制。' })
  }
  response.status(400).json({ error: error instanceof Error ? error.message : '请求处理失败。' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`ArtFlow project API: http://127.0.0.1:${port}`)
})
