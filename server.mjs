import express from 'express'
import multer from 'multer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const app = express()
const port = 4174
const workspaceRoot = resolve(process.cwd())
const dataRoot = join(workspaceRoot, 'project-data')
const projectsRoot = join(dataRoot, 'projects')
const incomingRoot = join(dataRoot, '.incoming')
const defaultProjectId = 'project-default'
const supportedModules = new Set(['character-motion', 'skill-vfx'])
const assetModules = new Set(['main-visual-design', 'character-design', 'character-motion', 'skill-design', 'skill-vfx', 'background-design', 'map-elements', 'game-ui', 'story-level-design', 'unassigned'])
const supportedExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi'])
const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
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

app.use(express.json({ limit: '2mb' }))
app.use('/project-data', express.static(dataRoot, {
  dotfiles: 'deny',
  index: false,
  fallthrough: false,
}))

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

function assertProjectId(value) {
  const projectId = String(value || '')
  if (!projectIdPattern.test(projectId)) throw new Error('无效的项目 ID。')
  return projectId
}

function getProjectFolder(projectId) {
  return join(projectsRoot, assertProjectId(projectId))
}

async function ensureProjectFolders(projectId) {
  const projectFolder = getProjectFolder(projectId)
  await Promise.all([
    mkdir(join(projectFolder, 'assets', 'source'), { recursive: true }),
    mkdir(join(projectFolder, 'assets', 'runtime'), { recursive: true }),
    mkdir(join(projectFolder, 'assets', 'references'), { recursive: true }),
    mkdir(join(projectFolder, 'assets', 'versions'), { recursive: true }),
    mkdir(join(projectFolder, 'frame-sequences'), { recursive: true }),
    mkdir(join(projectFolder, 'evidence'), { recursive: true }),
  ])
  return projectFolder
}

async function createProjectRecord({ id, name, description = '', isDefault = false }) {
  const projectFolder = await ensureProjectFolders(id)
  const now = new Date().toISOString()
  const record = {
    schemaVersion: 1,
    id,
    name: String(name).trim().slice(0, 60),
    description: String(description).trim().slice(0, 240),
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
  const projectFolder = getProjectFolder(project.id)
  const [frameSequenceCount, imageAssetCount] = await Promise.all([
    countDirectories(join(projectFolder, 'frame-sequences')),
    countImageAssets(join(projectFolder, 'assets', 'source')),
  ])
  return { ...project, frameSequenceCount, imageAssetCount }
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

function parseNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toPublicManifest(manifest) {
  const baseUrl = `/project-data/projects/${manifest.projectId}/frame-sequences/${manifest.id}`
  return {
    ...manifest,
    sourceUrl: `${baseUrl}/${manifest.sourceFile}`,
    manifestUrl: `${baseUrl}/manifest.json`,
    frameUrls: manifest.frames.map((frame) => `${baseUrl}/frames/${frame}`),
  }
}

async function loadManifests(projectId, moduleId) {
  const sequencesRoot = join(getProjectFolder(projectId), 'frame-sequences')
  const entries = await readdir(sequencesRoot, { withFileTypes: true })
  const manifests = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(sequencesRoot, entry.name, 'manifest.json'), 'utf8')
      const manifest = JSON.parse(raw)
      if (!moduleId || manifest.moduleId === moduleId) manifests.push(toPublicManifest(manifest))
    } catch { /* Ignore incomplete sequence folders. */ }
  }
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function toPublicCompletedSequence(manifest) {
  const baseUrl = `/project-data/projects/${manifest.projectId}/assets/runtime/${manifest.moduleId}/${manifest.id}`
  return {
    ...manifest,
    manifestUrl: `${baseUrl}/asset.json`,
    frameUrls: manifest.frames.map((frame) => `${baseUrl}/frames/${frame}`),
  }
}

async function loadCompletedSequences(projectId, moduleId) {
  const moduleRoot = join(getProjectFolder(projectId), 'assets', 'runtime', moduleId)
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
  const sourceRoot = join(getProjectFolder(projectId), 'assets', 'source')
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
          imageUrl: `/project-data/projects/${projectId}/assets/source/${moduleFolder.name}/${assetFolder.name}/${manifest.fileName}`,
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
  'main-visual-design': ['character-design', 'character-motion', 'skill-design', 'skill-vfx', 'game-ui', 'story-level-design', 'background-design', 'map-elements'],
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
  const [registry, standards] = await Promise.all([ensureAssetRegistry(projectId), loadTechnicalStandards(projectId)])
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

app.post('/api/projects', async (request, response) => {
  const name = String(request.body.name || '').trim()
  if (!name) return response.status(400).json({ error: '请输入项目名称。' })
  if (name.length > 60) return response.status(400).json({ error: '项目名称不能超过 60 个字符。' })
  const id = `project-${Date.now()}-${randomUUID().slice(0, 8)}`
  const project = await createProjectRecord({ id, name, description: request.body.description })
  response.status(201).json(await decorateProject(project))
})

app.delete('/api/projects/:projectId', async (request, response) => {
  try {
    const projectId = assertProjectId(request.params.projectId)
    if (projectId === defaultProjectId) throw new Error('默认项目不能删除。')
    const projectFolder = getProjectFolder(projectId)
    if (!existsSync(join(projectFolder, 'project.json'))) return response.status(404).json({ error: '项目不存在。' })
    await rm(projectFolder, { recursive: true, force: true })
    response.json({ ok: true, id: projectId })
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
    const [registry, standards] = await Promise.all([ensureAssetRegistry(projectId), loadTechnicalStandards(projectId)])
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
    const created = []
    for (const [index, file] of files.entries()) {
      const extension = extname(file.originalname).toLowerCase()
      if (!supportedImageExtensions.has(extension)) throw new Error('图片格式不受支持。')
      const id = `asset-${Date.now()}-${randomUUID().slice(0, 8)}`
      const assetFolder = join(getProjectFolder(projectId), 'assets', 'source', moduleId, id)
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
        originalName: file.originalname,
        fileName,
        size: file.size,
        width: imageMetadata.width,
        height: imageMetadata.height,
        pixelFormat: imageMetadata.pixelFormat,
        alphaDetected: imageMetadata.alphaDetected,
        status: 'source',
        outputDirectory: `project-data/projects/${projectId}/assets/source/${moduleId}/${id}`,
      }
      await writeFile(join(assetFolder, 'asset.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      const publicManifest = { ...manifest, imageUrl: `/project-data/projects/${projectId}/assets/source/${moduleId}/${id}/${fileName}` }
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
    const assetFolder = join(getProjectFolder(projectId), 'assets', 'source', moduleId, assetId)
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
    if (moduleId && !supportedModules.has(moduleId)) throw new Error('不支持的模块。')
    response.json(await loadManifests(projectId, moduleId))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '无法读取序列帧。' })
  }
})

app.get('/api/completed-sequences', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    await readProject(projectId)
    const moduleId = String(request.query.moduleId || '')
    if (!supportedModules.has(moduleId)) throw new Error('只支持读取角色动作或技能动效正式素材。')
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

    const assetFolder = join(getProjectFolder(projectId), 'assets', 'runtime', moduleId, assetId)
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

    const sequenceFolder = join(getProjectFolder(projectId), 'frame-sequences', sequenceId)
    const sequenceManifestPath = join(sequenceFolder, 'manifest.json')
    if (!existsSync(sequenceManifestPath)) return response.status(404).json({ error: '序列帧不存在。' })
    const source = JSON.parse(await readFile(sequenceManifestPath, 'utf8'))
    if (source.projectId !== projectId || !supportedModules.has(source.moduleId)) throw new Error('序列帧不属于当前项目。')

    const id = `completed-${Date.now()}-${randomUUID().slice(0, 8)}`
    assetFolder = join(getProjectFolder(projectId), 'assets', 'runtime', source.moduleId, id)
    await mkdir(assetFolder, { recursive: true })
    await cp(join(sequenceFolder, 'frames'), join(assetFolder, 'frames'), { recursive: true })

    const manifest = {
      schemaVersion: 1,
      assetType: 'frame-sequence',
      status: 'completed',
      id,
      projectId,
      moduleId: source.moduleId,
      name,
      createdAt: new Date().toISOString(),
      sourceSequenceId: source.id,
      sourceSequenceName: source.name,
      outputDirectory: `project-data/projects/${projectId}/assets/runtime/${source.moduleId}/${id}`,
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

app.post('/api/frame-sequences', upload.single('video'), async (request, response) => {
  const uploadedFile = request.file
  if (!uploadedFile) return response.status(400).json({ error: '请选择一个受支持的视频文件。' })

  let sequenceFolder
  try {
    const projectId = assertProjectId(request.body.projectId)
    await readProject(projectId)
    const moduleId = String(request.body.moduleId || '')
    if (!supportedModules.has(moduleId)) throw new Error('只允许在角色动作设计和技能动效设计中制作序列帧。')

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
    const sequencesRoot = join(getProjectFolder(projectId), 'frame-sequences')
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
      name: cleanName(request.body.name),
      createdAt: new Date().toISOString(),
      sourceOriginalName: uploadedFile.originalname,
      sourceFile,
      outputDirectory: `project-data/projects/${projectId}/frame-sequences/${id}/frames`,
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

app.delete('/api/frame-sequences/:id', async (request, response) => {
  try {
    const projectId = assertProjectId(request.query.projectId)
    const id = String(request.params.id || '')
    if (!/^\d{8}T\d{6}-[a-f0-9]{8}$/i.test(id)) throw new Error('无效的序列帧 ID。')
    const sequenceFolder = join(getProjectFolder(projectId), 'frame-sequences', id)
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
