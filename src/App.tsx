import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpNarrowWide,
  BookOpenCheck,
  Boxes,
  Brush,
  Check,
  ChevronRight,
  CircleGauge,
  CircleAlert,
  ClipboardList,
  Clock3,
  CloudSun,
  Crosshair,
  FileVideo2,
  Film,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Gamepad2,
  Footprints,
  Image,
  ImagePlus,
  Layers3,
  Link2,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MapPinned,
  MoreHorizontal,
  PackagePlus,
  PawPrint,
  Palette,
  PanelsTopLeft,
  Pause,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { defaultModules, type AiPromptProfile, type ArtModule, type RequirementSection } from './data/modules'
import { getActiveProjectId, loadLegacyModules, mergeModules, saveLegacyModules, setActiveProjectId } from './lib/storage'
import { ProjectPlanPage } from './ProjectPlanPage'
import { CityContentPage } from './CityContentPage'
import { PetContentPage } from './PetContentPage'
import { GameContentPage } from './GameContentPage'
import { MainVisualDeliverablesPanel } from './MainVisualDeliverablesPanel'
import { CharacterSettingSheetsPanel } from './CharacterSettingSheetsPanel'

const isStaticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'

const moduleIcons = {
  gameplay: CircleGauge,
  detailedGameplay: GitBranch,
  artDirection: Palette,
  character: UserRound,
  motion: Footprints,
  skill: Swords,
  vfx: Zap,
  background: CloudSun,
  elements: Boxes,
  ui: PanelsTopLeft,
  storyLevel: MapPinned,
}

const storyLevelChildIds = ['background-design', 'map-elements'] as const
const moduleDisplayOrder = [
  'gameplay-design',
  'detailed-gameplay-design',
  'main-visual-design',
  'character-design',
  'character-motion',
  'skill-design',
  'skill-vfx',
  'story-level-design',
  'background-design',
  'map-elements',
  'game-ui',
]
const gameDesignModuleIds = ['gameplay-design', 'detailed-gameplay-design'] as const
const sidebarArtModuleOrder = [
  'main-visual-design',
  'game-ui',
  'story-level-design',
  'character-design',
  'character-motion',
  'skill-design',
  'skill-vfx',
]

function sortModulesForDisplay(modules: ArtModule[]) {
  return [...modules].sort((first, second) => moduleDisplayOrder.indexOf(first.id) - moduleDisplayOrder.indexOf(second.id))
}

function sortModulesForSidebar(modules: ArtModule[]) {
  return [...modules].sort((first, second) => sidebarArtModuleOrder.indexOf(first.id) - sidebarArtModuleOrder.indexOf(second.id))
}

function isStoryLevelChild(module: ArtModule) {
  return storyLevelChildIds.includes(module.id as (typeof storyLevelChildIds)[number])
}

function isGameDesignModule(module: ArtModule) {
  return gameDesignModuleIds.includes(module.id as (typeof gameDesignModuleIds)[number])
}

type AccentStyle = CSSProperties & {
  '--accent': string
  '--tint': string
}

type Project = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  isDefault: boolean
  assetStoragePath: string
  assetStorageMode: 'managed' | 'external'
  frameSequenceCount: number
  imageAssetCount: number
}

const staticDemoProject: Project = {
  id: 'browser-demo',
  name: '在线演示项目',
  description: 'GitHub Pages 在线演示；模块要求保存在当前浏览器。',
  createdAt: '',
  updatedAt: '',
  isDefault: true,
  assetStoragePath: '浏览器本地存储（无文件目录）',
  assetStorageMode: 'managed',
  frameSequenceCount: 0,
  imageAssetCount: 0,
}

function App() {
  const { pathname } = useLocation()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProject] = useState('')
  const [modules, setModules] = useState<ArtModule[]>(structuredClone(defaultModules))
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [menuOpen, setMenuOpen] = useState(false)
  const [projectLoading, setProjectLoading] = useState(true)

  const activeProject = projects.find((project) => project.id === activeProjectId)

  const loadProjectModules = async (projectId: string, migrateLegacy = false) => {
    setProjectLoading(true)
    const response = await fetch(`/api/projects/${projectId}/modules`)
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '无法读取项目配置。')
    const nextModules = result.modules
      ? mergeModules(defaultModules, result.modules)
      : migrateLegacy
        ? loadLegacyModules(structuredClone(defaultModules))
        : structuredClone(defaultModules)
    setModules(nextModules)
    if (!result.modules) {
      await fetch(`/api/projects/${projectId}/modules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: nextModules }),
      })
    }
    setProjectLoading(false)
  }

  const refreshProjects = async () => {
    if (isStaticDemo) {
      setProjects([staticDemoProject])
      return [staticDemoProject]
    }
    const response = await fetch('/api/projects')
    const list = await response.json()
    if (!response.ok) throw new Error(list.error || '无法读取项目列表。')
    setProjects(list)
    return list as Project[]
  }

  useEffect(() => {
    if (isStaticDemo) {
      setProjects([staticDemoProject])
      setActiveProject(staticDemoProject.id)
      setActiveProjectId(staticDemoProject.id)
      setModules(loadLegacyModules(structuredClone(defaultModules)))
      setProjectLoading(false)
      return
    }
    void (async () => {
      try {
        const list = await refreshProjects()
        const remembered = getActiveProjectId()
        const nextProject = list.find((project) => project.id === remembered) || list[0]
        if (!nextProject) return
        setActiveProject(nextProject.id)
        setActiveProjectId(nextProject.id)
        await loadProjectModules(nextProject.id, nextProject.isDefault)
      } catch {
        setProjectLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!activeProjectId || projectLoading) return
    if (isStaticDemo) {
      saveLegacyModules(modules)
      setSaveState('saved')
      return
    }
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${activeProjectId}/modules`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modules }),
        })
        if (!response.ok) throw new Error('save failed')
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 260)
    return () => window.clearTimeout(timer)
  }, [modules, activeProjectId, projectLoading])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const updateModule = (moduleId: string, updater: (module: ArtModule) => ArtModule) => {
    setModules((current) => current.map((module) => (module.id === moduleId ? updater(module) : module)))
  }

  const resetModule = (moduleId: string) => {
    const original = defaultModules.find((module) => module.id === moduleId)
    if (!original) return
    updateModule(moduleId, () => structuredClone(original))
  }

  const resetAll = () => {
    setModules(structuredClone(defaultModules))
  }

  const switchProject = async (projectId: string) => {
    if (projectId === activeProjectId) return
    setActiveProject(projectId)
    setActiveProjectId(projectId)
    await loadProjectModules(projectId)
    window.scrollTo(0, 0)
  }

  const createProject = async (name: string, description: string, assetStoragePath: string) => {
    if (isStaticDemo) throw new Error('在线演示版不创建服务器项目，请在本地运行完整平台。')
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, assetStorageBasePath: assetStoragePath }),
    })
    const project = await response.json()
    if (!response.ok) throw new Error(project.error || '项目创建失败。')
    await refreshProjects()
    await switchProject(project.id)
  }

  const deleteProject = async (project: Project) => {
    const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '项目删除失败。')
    const list = await refreshProjects()
    const nextProject = list[0]
    if (nextProject) await switchProject(nextProject.id)
  }

  if (projectLoading && !activeProjectId) {
    return <div className="app-loading"><LoaderCircle className="spin" size={28} /><strong>正在加载项目工作区…</strong></div>
  }

  return (
    <div className="app-shell">
      <Sidebar
        modules={modules}
        projects={projects}
        activeProject={activeProject}
        menuOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSwitchProject={(projectId) => void switchProject(projectId)}
        onCreateProject={createProject}
        onDeleteProject={deleteProject}
        onRefreshProjects={refreshProjects}
        staticDemo={isStaticDemo}
      />
      <div className="app-main">
        <Topbar saveState={saveState} onMenu={() => setMenuOpen(true)} staticDemo={isStaticDemo} />
        <main className="page-stage">
          <Routes>
            <Route path="/" element={<Dashboard modules={modules} onResetAll={resetAll} />} />
            <Route path="/assets" element={<ImageAssetLibrary projectId={activeProjectId} modules={modules} />} />
            <Route path="/asset-registry" element={<AssetRegistry projectId={activeProjectId} modules={modules} />} />
            <Route path="/asset-registry/:assetId" element={<AssetDetail projectId={activeProjectId} modules={modules} />} />
            <Route path="/project-plan" element={<ProjectPlanPage projectId={activeProjectId} modules={modules} staticDemo={isStaticDemo} />} />
            <Route path="/city-content-management" element={<CityContentPage projectId={activeProjectId} staticDemo={isStaticDemo} />} />
            <Route path="/pet-content-management" element={<PetContentPage projectId={activeProjectId} staticDemo={isStaticDemo} mainVisualModule={modules.find((module) => module.id === 'main-visual-design')} />} />
            <Route path="/game-content-management" element={<GameContentPage projectId={activeProjectId} staticDemo={isStaticDemo} />} />
            <Route path="/technical-standards" element={<TechnicalStandardsPage projectId={activeProjectId} />} />
            <Route
              path="/modules/:moduleId/requirements"
              element={
                <ModuleDetail
                  modules={modules}
                  updateModule={updateModule}
                  resetModule={resetModule}
                  projectId={activeProjectId}
                  requirementsMode
                />
              }
            />
            <Route
              path="/modules/gameplay-design/edit"
              element={<Navigate to="/modules/gameplay-design" replace />}
            />
            <Route
              path="/modules/detailed-gameplay-design/edit"
              element={<Navigate to="/modules/detailed-gameplay-design" replace />}
            />
            <Route
              path="/modules/:moduleId"
              element={
                <ModuleDetail
                  modules={modules}
                  updateModule={updateModule}
                  resetModule={resetModule}
                  projectId={activeProjectId}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Sidebar({
  modules,
  projects,
  activeProject,
  menuOpen,
  onClose,
  onSwitchProject,
  onCreateProject,
  onDeleteProject,
  onRefreshProjects,
  staticDemo,
}: {
  modules: ArtModule[]
  projects: Project[]
  activeProject?: Project
  menuOpen: boolean
  onClose: () => void
  onSwitchProject: (projectId: string) => void
  onCreateProject: (name: string, description: string, assetStoragePath: string) => Promise<void>
  onDeleteProject: (project: Project) => Promise<void>
  onRefreshProjects: () => Promise<Project[]>
  staticDemo: boolean
}) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [assetStoragePath, setAssetStoragePath] = useState('')
  const [selectingFolder, setSelectingFolder] = useState(false)
  const [projectError, setProjectError] = useState('')

  const selectAssetFolder = async () => {
    setSelectingFolder(true)
    setProjectError('')
    try {
      const response = await fetch('/api/system/select-folder', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '无法选择素材目录。')
      if (!result.cancelled && result.path) setAssetStoragePath(result.path)
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '无法选择素材目录。')
    } finally {
      setSelectingFolder(false)
    }
  }

  const submitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectName.trim() || !assetStoragePath) return
    setCreating(true)
    setProjectError('')
    try {
      await onCreateProject(projectName, projectDescription, assetStoragePath)
      setProjectName('')
      setProjectDescription('')
      setAssetStoragePath('')
      setProjectMenuOpen(false)
      onClose()
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '项目创建失败。')
    } finally {
      setCreating(false)
    }
  }

  const removeProject = async (project: Project) => {
    const message = project.assetStorageMode === 'external'
      ? `确定删除项目“${project.name}”吗？平台内的项目配置会被删除，但外部素材文件夹会保留：\n${project.assetStoragePath}`
      : `确定删除项目“${project.name}”吗？该项目的全部配置、图片、原视频和序列帧都会被永久删除。`
    if (!window.confirm(message)) return
    setProjectError('')
    try {
      await onDeleteProject(project)
      setProjectMenuOpen(false)
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '项目删除失败。')
    }
  }

  const gameplayModule = modules.find((module) => module.id === 'gameplay-design')
  const detailedGameplayModule = modules.find((module) => module.id === 'detailed-gameplay-design')

  return (
    <>
      <button
        className={`sidebar-scrim ${menuOpen ? 'is-visible' : ''}`}
        onClick={onClose}
        aria-label="关闭导航"
      />
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Link to="/" className="brand" onClick={onClose}>
          <span className="brand-mark"><Sparkles size={19} strokeWidth={2.1} /></span>
          <span>
            <strong>ARTFLOW</strong>
            <small>GAME ART STUDIO</small>
          </span>
        </Link>

        <button className="sidebar-project" onClick={() => { if (!projectMenuOpen) void onRefreshProjects(); setProjectMenuOpen((open) => !open) }} aria-expanded={projectMenuOpen}>
          <span className="project-thumb"><Brush size={19} /></span>
          <span>
            <small>当前项目</small>
            <strong>{activeProject?.name || '加载中…'}</strong>
          </span>
          <MoreHorizontal size={18} />
        </button>

        {projectMenuOpen && (
          <div className="project-switcher">
            <div className="project-switcher-title"><strong>切换项目</strong><span>{projects.length}</span></div>
            <div className="project-options">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={project.id === activeProject?.id ? 'active' : ''}
                  onClick={() => { onSwitchProject(project.id); setProjectMenuOpen(false); onClose() }}
                >
                  <span>{project.name.slice(0, 1)}</span>
                  <div>
                    <strong>{project.name}</strong>
                    <small>{project.imageAssetCount} 图片 · {project.frameSequenceCount} 序列</small>
                    <small className="project-storage-path" title={project.assetStoragePath}>{project.assetStoragePath}</small>
                  </div>
                  {project.id === activeProject?.id && <Check size={14} />}
                </button>
              ))}
            </div>
            {staticDemo ? (
              <p className="project-demo-note">在线演示仅保存模块要求到当前浏览器。项目创建、素材上传和序列帧生成请在本地运行完整平台。</p>
            ) : <form className="create-project-form" onSubmit={submitProject}>
              <strong><PackagePlus size={14} /> 创建新项目</strong>
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" maxLength={60} />
              <textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="项目说明（可选）" maxLength={240} rows={2} />
              <div className="asset-folder-field">
                <span>美术素材存放位置</span>
                <button type="button" onClick={() => void selectAssetFolder()} disabled={selectingFolder}>
                  {selectingFolder ? <LoaderCircle className="spin" size={13} /> : <FolderOpen size={13} />}
                  {selectingFolder ? '正在打开…' : assetStoragePath ? '重新选择位置' : '选择已有文件夹'}
                </button>
                <code title={assetStoragePath}>{assetStoragePath || '尚未选择素材存放位置'}</code>
                <small>可以选择已有文件的文件夹，平台会在其中创建项目专属子目录。</small>
              </div>
              {projectError && <small className="project-error">{projectError}</small>}
              <button type="submit" disabled={creating || !projectName.trim() || !assetStoragePath}>{creating ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} 创建并进入</button>
              {activeProject && !activeProject.isDefault && (
                <button className="delete-project-button" type="button" onClick={() => void removeProject(activeProject)}><Trash2 size={13} /> 删除当前项目</button>
              )}
            </form>}
          </div>
        )}

        <nav className="sidebar-nav" aria-label="主导航">
          <p className="nav-label">工作台</p>
          <NavLink to="/" end onClick={onClose}>
            <LayoutDashboard size={18} />
            模块总览
          </NavLink>
          <NavLink to="/assets" onClick={onClose}>
            <Image size={18} />
            图片素材库
          </NavLink>
          <NavLink to="/asset-registry" onClick={onClose}>
            <FolderKanban size={18} />
            资产注册中心
          </NavLink>

          <p className="nav-label modules-label">游戏设计</p>
          {gameplayModule && (() => {
            const GameplayIcon = moduleIcons[gameplayModule.icon]
            return <div className="nav-module-group has-children gameplay-nav-group">
              <NavLink to={`/modules/${gameplayModule.id}`} onClick={onClose}>
                <span className="nav-module-icon" style={{ color: gameplayModule.accent }}><GameplayIcon size={17} /></span>
                <span>{gameplayModule.title}</span>
                <span className="nav-order">UP</span>
              </NavLink>
              {detailedGameplayModule && (() => {
                const DetailedIcon = moduleIcons[detailedGameplayModule.icon]
                return <NavLink className="nav-child-module" to={`/modules/${detailedGameplayModule.id}`} onClick={onClose}>
                  <span className="nav-child-branch" />
                  <span className="nav-module-icon" style={{ color: detailedGameplayModule.accent }}><DetailedIcon size={16} /></span>
                  <span>{detailedGameplayModule.title}</span>
                  <span className="nav-order">DT</span>
                </NavLink>
              })()}
              <NavLink className="nav-child-module" to="/city-content-management" onClick={onClose}>
                <span className="nav-child-branch" />
                <span className="nav-module-icon" style={{ color: '#567a92' }}><MapPinned size={16} /></span>
                <span>城市内容管理</span>
                <span className="nav-order">CT</span>
              </NavLink>
              <NavLink className="nav-child-module" to="/pet-content-management" onClick={onClose}>
                <span className="nav-child-branch" />
                <span className="nav-module-icon" style={{ color: '#8b6b46' }}><PawPrint size={16} /></span>
                <span>宠物内容管理</span>
                <span className="nav-order">PT</span>
              </NavLink>
              <NavLink className="nav-child-module" to="/game-content-management" onClick={onClose}>
                <span className="nav-child-branch" />
                <span className="nav-module-icon" style={{ color: '#6276a5' }}><Gamepad2 size={16} /></span>
                <span>游戏管理</span>
                <span className="nav-order">GM</span>
              </NavLink>
            </div>
          })()}
          <NavLink to="/project-plan" onClick={onClose}>
            <ClipboardList size={18} />
            项目计划
            <span className="nav-order">PM</span>
          </NavLink>
          <NavLink to="/technical-standards" onClick={onClose}>
            <Settings2 size={18} />
            技术美术规范
          </NavLink>

          <p className="nav-label modules-label">美术生产模块</p>
          {sortModulesForSidebar(modules.filter((module) => !isGameDesignModule(module) && !isStoryLevelChild(module))).map((module) => {
            const Icon = moduleIcons[module.icon]
            return (
              <div className={`nav-module-group${module.id === 'story-level-design' ? ' has-children' : ''}`} key={module.id}>
                <NavLink to={`/modules/${module.id}`} onClick={onClose}>
                  <span className="nav-module-icon" style={{ color: module.accent }}><Icon size={17} /></span>
                  <span>{module.title}</span>
                  <span className="nav-order">0{module.order}</span>
                </NavLink>
                {module.id === 'story-level-design' && storyLevelChildIds.map((childId) => {
                  const child = modules.find((candidate) => candidate.id === childId)
                  if (!child) return null
                  const ChildIcon = moduleIcons[child.icon]
                  return (
                    <NavLink className="nav-child-module" key={child.id} to={`/modules/${child.id}`} onClick={onClose}>
                      <span className="nav-child-branch" />
                      <span className="nav-module-icon" style={{ color: child.accent }}><ChildIcon size={15} /></span>
                      <span>{child.title}</span>
                      <span className="nav-order">0{child.order}</span>
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-note">
          <span><ShieldCheck size={18} /></span>
          <div>
            <strong>项目数据隔离</strong>
            <p>配置与图片素材按项目独立保存</p>
          </div>
        </div>
      </aside>
    </>
  )
}

function Topbar({ saveState, onMenu, staticDemo }: { saveState: 'saved' | 'saving' | 'error'; onMenu: () => void; staticDemo: boolean }) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} aria-label="打开导航"><Menu size={21} /></button>
      <div className="breadcrumb"><span>游戏制作</span><ChevronRight size={14} /><strong>工作台</strong></div>
      <div className="topbar-actions">
        <span className={`save-indicator ${saveState}`}>
          {saveState === 'saved' ? <Check size={14} /> : saveState === 'saving' ? <Clock3 size={14} /> : <X size={14} />}
          {staticDemo ? '在线演示 · 已保存到此浏览器' : saveState === 'saved' ? '已保存到当前项目' : saveState === 'saving' ? '正在保存' : '保存失败'}
        </span>
        <span className="avatar">PF</span>
      </div>
    </header>
  )
}

type AssetStatus = 'draft' | 'in_review' | 'confirmed' | 'deprecated'
type AssetValidationCheck = { id: string; label: string; status: 'passed' | 'warning' | 'failed'; message: string }
type RegisteredAssetVersion = {
  id: string
  number: number
  status: AssetStatus
  parentVersionId: string | null
  changeNote: string
  createdAt: string
  artifact: {
    sourceKind: 'image' | 'frame-sequence'
    sourcePath?: string
    runtimePath?: string
    manifestUrl?: string
    frameUrls?: string[]
    extension?: string
    size?: number
    width?: number | null
    height?: number | null
    fps?: number
    duration?: number
    frameCount?: number
  }
  validation: { status: 'passed' | 'failed'; failed: number; warnings: number; checkedAt: string; standardsVersion: number; checks: AssetValidationCheck[] } | null
}
type AssetRelation = { type: string; id: string; name: string; usage: string }
type AssetImpact = { id: string; sourceType: string; sourceIds: string[]; reason: string; createdAt: string; resolvedAt: string | null; resolution: string | null }
type RegisteredAsset = {
  id: string
  name: string
  assetType: string
  moduleId: string
  relations: AssetRelation[]
  currentVersionId: string
  officialVersionId: string | null
  impactStatus: 'clear' | 'review_required'
  impacts: AssetImpact[]
  versions: RegisteredAssetVersion[]
  history: { type: string; at: string; message: string }[]
  createdAt: string
  updatedAt: string
}

const assetStatusCopy: Record<AssetStatus, string> = {
  draft: '草稿',
  in_review: '审核中',
  confirmed: '已确认',
  deprecated: '已废弃',
}

function getCurrentAssetVersion(asset: RegisteredAsset) {
  return asset.versions.find((version) => version.id === asset.currentVersionId) || asset.versions.at(-1)
}

function AssetRegistry({ projectId, modules }: { projectId: string; modules: ArtModule[] }) {
  const [assets, setAssets] = useState<RegisteredAsset[]>([])
  const [summary, setSummary] = useState({ total: 0, draft: 0, inReview: 0, confirmed: 0, impacted: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const loadRegistry = async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/asset-registry?projectId=${projectId}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '资产注册表读取失败。')
      setAssets(result.assets)
      setSummary(result.summary)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '资产注册表读取失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadRegistry() }, [projectId])

  const visibleAssets = useMemo(() => assets.filter((asset) => {
    const version = getCurrentAssetVersion(asset)
    const textMatch = `${asset.name} ${asset.id}`.toLowerCase().includes(query.trim().toLowerCase())
    return textMatch && (!moduleFilter || asset.moduleId === moduleFilter) && (!statusFilter || version?.status === statusFilter)
  }), [assets, query, moduleFilter, statusFilter])

  const moduleName = (id: string) => modules.find((module) => module.id === id)?.title || id

  return (
    <div className="registry-page">
      <div className="registry-hero">
        <div>
          <span className="section-kicker"><GitBranch size={14} /> PROJECT ASSET REGISTRY</span>
          <h1>资产注册与版本中心</h1>
          <p>统一管理逻辑资产、v1 → v2 → 终稿迭代、审核状态、模块归属和上游变更复核；原文件仍保存在各自项目目录。</p>
        </div>
        <div className="registry-hero-actions">
          <Link className="secondary-action" to="/assets"><ImagePlus size={16} /> 上传源图片</Link>
          <Link className="primary-action" to="/technical-standards"><Settings2 size={16} /> 技术规范</Link>
        </div>
      </div>

      <div className="registry-summary">
        <div><small>逻辑资产</small><strong>{summary.total}</strong></div>
        <div><small>草稿</small><strong>{summary.draft}</strong></div>
        <div><small>审核中</small><strong>{summary.inReview}</strong></div>
        <div><small>正式版本</small><strong>{summary.confirmed}</strong></div>
        <div className={summary.impacted ? 'needs-attention' : ''}><small>待联动复核</small><strong>{summary.impacted}</strong></div>
      </div>

      <div className="registry-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产名称或 ID" />
        <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
          <option value="">全部模块</option>
          {sortModulesForDisplay(modules).map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(assetStatusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button onClick={() => void loadRegistry()}><RotateCcw size={15} /> 刷新</button>
      </div>

      {loading ? <div className="registry-empty"><LoaderCircle className="spin" size={24} /> 正在同步项目资产…</div>
        : error ? <div className="registry-empty is-error"><X size={22} /> {error}</div>
          : visibleAssets.length ? (
            <div className="registry-grid">
              {visibleAssets.map((asset) => {
                const version = getCurrentAssetVersion(asset)
                const preview = version?.artifact.sourceKind === 'image' ? version.artifact.sourcePath : version?.artifact.frameUrls?.[0]
                return (
                  <Link key={asset.id} to={`/asset-registry/${asset.id}`} className="registry-card">
                    <div className="registry-card-preview">{preview ? <img src={preview} alt="" /> : <FolderKanban size={35} />}</div>
                    <div className="registry-card-body">
                      <div className="registry-card-top"><span>{moduleName(asset.moduleId)}</span><span className={`asset-status ${version?.status}`}>{version ? assetStatusCopy[version.status] : '未知'}</span></div>
                      <h3>{asset.name}</h3>
                      <p>{asset.id}</p>
                      <div className="registry-card-meta"><strong>{version?.id}</strong><span>{asset.officialVersionId ? `正式 ${asset.officialVersionId}` : '尚无正式版本'}</span><span>{asset.relations.length} 个关联</span></div>
                      {asset.impactStatus === 'review_required' && <div className="impact-chip"><CircleAlert size={14} /> 上游已变更，待复核</div>}
                    </div>
                    <ChevronRight size={18} />
                  </Link>
                )
              })}
            </div>
          ) : <div className="registry-empty"><FolderKanban size={28} /><strong>暂无匹配资产</strong><p>从图片素材库上传图片，或把序列帧保存为已完成动作 / 动效后，会自动进入这里。</p></div>}
    </div>
  )
}

function AssetDetail({ projectId, modules }: { projectId: string; modules: ArtModule[] }) {
  const { assetId = '' } = useParams()
  const [asset, setAsset] = useState<RegisteredAsset | null>(null)
  const [relations, setRelations] = useState<AssetRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadAsset = async () => {
    if (!projectId || !assetId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/asset-registry/${assetId}?projectId=${projectId}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '资产读取失败。')
      setAsset(result)
      setRelations(result.relations || [])
    } catch (loadError) {
      setMessage({ type: 'error', text: loadError instanceof Error ? loadError.message : '资产读取失败。' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadAsset() }, [projectId, assetId])

  const runAction = async (path: string, method: 'POST' | 'PUT', body: Record<string, unknown>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/asset-registry/${assetId}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...body }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '操作失败。')
      setAsset(result)
      setRelations(result.relations || [])
      setMessage({ type: 'success', text: success })
    } catch (actionError) {
      setMessage({ type: 'error', text: actionError instanceof Error ? actionError.message : '操作失败。' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取资产版本…</div>
  if (!asset) return <div className="registry-empty is-error"><X size={24} /> {message?.text || '资产不存在。'}</div>
  const version = getCurrentAssetVersion(asset)
  if (!version) return <div className="registry-empty is-error">资产没有可用版本。</div>
  const preview = version.artifact.sourceKind === 'image' ? version.artifact.sourcePath : version.artifact.frameUrls?.[0]
  const unresolvedImpacts = asset.impacts.filter((impact) => !impact.resolvedAt)
  const moduleName = modules.find((module) => module.id === asset.moduleId)?.title || asset.moduleId
  const nextActions: { status: AssetStatus; label: string }[] = version.status === 'draft'
    ? [{ status: 'in_review', label: '提交审核' }]
    : version.status === 'in_review'
      ? [{ status: 'confirmed', label: '确认并设为正式版本' }, { status: 'draft', label: '退回草稿' }]
      : version.status === 'confirmed'
        ? [{ status: 'deprecated', label: '废弃此版本' }]
        : [{ status: 'draft', label: '恢复为草稿' }]

  const addRelation = () => setRelations((current) => [...current, { type: 'character', id: '', name: '', usage: '' }])
  const updateRelation = (index: number, key: keyof AssetRelation, value: string) => setRelations((current) => current.map((relation, relationIndex) => relationIndex === index ? { ...relation, [key]: value } : relation))

  return (
    <div className="asset-detail-page">
      <Link className="back-link" to="/asset-registry"><ArrowLeft size={16} /> 返回资产注册中心</Link>
      <div className="asset-detail-hero">
        <div className="asset-detail-preview">{preview ? <img src={preview} alt={asset.name} /> : <FolderKanban size={48} />}</div>
        <div className="asset-detail-title">
          <span>{moduleName} · {asset.assetType === 'frame-sequence' ? '序列帧' : '图片'}</span>
          <h1>{asset.name}</h1>
          <code>{asset.id}</code>
          <div className="asset-title-badges"><span className={`asset-status ${version.status}`}>{assetStatusCopy[version.status]}</span><span>{version.id}</span>{asset.officialVersionId && <span className="official-badge"><ShieldCheck size={13} /> 正式 {asset.officialVersionId}</span>}</div>
        </div>
        <div className="asset-detail-actions">
          <button onClick={() => void runAction('validate', 'POST', { versionId: version.id }, '自动校验已更新。')} disabled={busy}><BookOpenCheck size={16} /> 重新校验</button>
          <button className="primary-action" onClick={() => { const note = window.prompt('请填写新版本的变更说明：', `基于 ${version.id} 迭代`); if (note !== null) void runAction('versions', 'POST', { changeNote: note }, '已创建新的草稿版本。') }} disabled={busy}><GitBranch size={16} /> 创建下一版本</button>
          {nextActions.map((action) => <button key={action.status} onClick={() => void runAction('status', 'POST', { versionId: version.id, status: action.status }, `版本状态已更新为${assetStatusCopy[action.status]}。`)} disabled={busy}>{action.status === 'confirmed' ? <ShieldCheck size={16} /> : <ChevronRight size={16} />}{action.label}</button>)}
        </div>
      </div>
      {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}

      {unresolvedImpacts.length > 0 && (
        <section className="asset-impact-panel">
          <div><CircleAlert size={22} /><span><strong>此资产需要下游联动复核</strong><small>{unresolvedImpacts.map((impact) => impact.reason).join('；')}</small></span></div>
          <button onClick={() => void runAction('impact/acknowledge', 'POST', { resolution: '已人工复核，当前正式版本仍适用' }, '影响记录已复核。')} disabled={busy}><Check size={15} /> 当前版本仍适用</button>
        </section>
      )}

      <div className="asset-detail-columns">
        <section className="asset-panel">
          <div className="asset-panel-heading"><div><span>VERSION HISTORY</span><h2>版本与状态记录</h2></div><strong>{asset.versions.length} 个版本</strong></div>
          <div className="version-timeline">
            {[...asset.versions].reverse().map((item) => (
              <article key={item.id} className={item.id === asset.currentVersionId ? 'current' : ''}>
                <div className="version-node" />
                <div><div className="version-row"><strong>{item.id}</strong><span className={`asset-status ${item.status}`}>{assetStatusCopy[item.status]}</span>{asset.officialVersionId === item.id && <span className="official-badge">终稿指针</span>}</div><p>{item.changeNote}</p><small>{new Date(item.createdAt).toLocaleString('zh-CN')} {item.parentVersionId ? `· 基于 ${item.parentVersionId}` : ''}</small></div>
              </article>
            ))}
          </div>
        </section>

        <section className="asset-panel">
          <div className="asset-panel-heading"><div><span>AUTOMATIC VALIDATION</span><h2>自动校验</h2></div><span className={`validation-result ${version.validation?.status || 'unknown'}`}>{version.validation?.status === 'passed' ? '通过' : version.validation ? '未通过' : '未执行'}</span></div>
          <div className="validation-list">
            {version.validation?.checks.map((check) => <div key={check.id} className={check.status}><span>{check.status === 'passed' ? <Check size={15} /> : <CircleAlert size={15} />}</span><div><strong>{check.label}</strong><p>{check.message}</p></div></div>)}
          </div>
          {version.validation && <p className="validation-footnote">使用技术规范 v{version.validation.standardsVersion} · {version.validation.warnings} 项提醒 · {version.validation.failed} 项失败</p>}
        </section>
      </div>

      <section className="asset-panel relation-panel">
        <div className="asset-panel-heading"><div><span>ENTITY MAPPING</span><h2>资产与游戏对象关联</h2></div><button onClick={addRelation}><Plus size={15} /> 添加关联</button></div>
        {relations.length ? <div className="relation-editor">
          {relations.map((relation, index) => <div key={`${index}-${relation.type}`}>
            <select value={relation.type} onChange={(event) => updateRelation(index, 'type', event.target.value)}><option value="character">角色</option><option value="skill">技能</option><option value="level">关卡</option><option value="ui">UI</option><option value="scene">场景</option><option value="other">其他</option></select>
            <input value={relation.id} onChange={(event) => updateRelation(index, 'id', event.target.value)} placeholder="对象 ID（必填）" />
            <input value={relation.name} onChange={(event) => updateRelation(index, 'name', event.target.value)} placeholder="显示名称" />
            <input value={relation.usage} onChange={(event) => updateRelation(index, 'usage', event.target.value)} placeholder="用途，例如：主角待机动作" />
            <button aria-label="删除关联" onClick={() => setRelations((current) => current.filter((_, relationIndex) => relationIndex !== index))}><Trash2 size={15} /></button>
          </div>)}
        </div> : <p className="relation-empty">尚未关联角色、技能或关卡。关联后可从具体游戏对象反查其全部美术资产。</p>}
        <button className="save-relations" onClick={() => void runAction('relations', 'PUT', { relations }, '对象关联已保存。')} disabled={busy || relations.some((relation) => !relation.id.trim())}><Save size={15} /> 保存关联映射</button>
      </section>
    </div>
  )
}

type StandardValue = string | number | boolean | string[]
type StandardSection = Record<string, StandardValue>
type TechnicalStandards = {
  profileName: string
  version: number
  updatedAt: string
  revisions: { version: number; updatedAt: string; note: string }[]
  engine: StandardSection
  naming: StandardSection
  import: StandardSection
  materials: StandardSection
  rigging: StandardSection
  animation: StandardSection
  vfx: StandardSection
  validation: StandardSection
}

const standardSections: { id: keyof Pick<TechnicalStandards, 'engine' | 'naming' | 'import' | 'materials' | 'rigging' | 'animation' | 'vfx' | 'validation'>; title: string; description: string }[] = [
  { id: 'engine', title: 'Godot 引擎与资源结构', description: '目标版本、渲染器、平台、res:// 目录和预制体格式。' },
  { id: 'naming', title: '命名与版本后缀', description: '所有入库资产自动使用此正则和示例进行命名检查。' },
  { id: 'import', title: '引擎导入与预制体', description: '源文件、运行时文件、角色、VFX 和 UI 的落盘约定。' },
  { id: 'materials', title: '材质 / Shader', description: '材质、Shader、Uniform 命名及混合模式标准。' },
  { id: 'rigging', title: '骨骼绑定与蒙皮', description: '骨骼影响数、最小权重、归一化和根骨命名。' },
  { id: 'animation', title: '动画与压缩', description: '采样率、最大帧数、压缩容差、Root Motion 和循环标准。' },
  { id: 'vfx', title: '粒子与性能预算', description: '单特效粒子、并发粒子、Draw Call、贴图尺寸和时长上限。' },
  { id: 'validation', title: '自动校验阈值', description: '允许格式、尺寸和文件大小等硬性门禁。' },
]

const standardFieldLabels: Record<string, string> = {
  name: '引擎名称', version: '版本', renderer: '渲染器', targetPlatform: '目标平台', resourceRoot: '资源根目录', prefabExtension: '预制体扩展名', targetFps: '目标帧率', minimumResolution: '最低分辨率', aspectRule: '画面比例规则', inputRule: '输入适配规则', offlineRule: '离线运行规则', contentPackMountRule: '城市资源包挂载规则', testDeviceRule: '最低测试设备规则', performanceBudget: '帧时间与帧率预算', memoryBudget: '内存与显存预算', loadBudget: '启动与加载预算', packageBudget: '应用与内容包体预算',
  pattern: '命名正则', example: '命名示例', lowercaseRecommended: '建议小写', versionSuffix: '版本后缀', idRule: '业务 ID 规则', cityPackExample: '城市包命名示例', sourceRoot: '源文件目录', runtimeRoot: '运行时目录', characterSceneRoot: '角色场景目录', environmentSceneRoot: '城市场景目录', petSceneRoot: '宠物场景目录', vfxSceneRoot: '特效场景目录', uiRoot: 'UI 目录', audioRoot: '西语音频目录', cityPackRoot: '城市资源包目录', textureFilter: '纹理过滤', textureCompression: '纹理压缩', prefabRule: '预制体规则', cityPackStructure: '城市包结构', audioImportRule: '语音音频导入', uiScalingRule: 'UI 缩放规则', touchTargetRule: '触控热区规则', safeAreaRule: '安全区规则', fontRule: '字体规则', worldScaleRule: '世界尺度与网格', cameraScaleRule: '镜头与角色占比', renderLayerRule: '渲染层级与遮挡', atlasRule: '图集规格', assetManifestRule: '运行时资产清单', asrRuntimeRule: 'ASR运行时规则', audioConcurrencyRule: '音频并发预算', aiHandoffStandardId: 'AI 输出接入规范编号', aiResponsibilityRule: 'AI 生成与技术接入职责', aiCanvasFormatRule: 'AI 源图接入格式与限制', aiAlphaDeliveryRule: 'AI 透明与拆分交付', aiImportHandoffRule: 'AI 源图导入与派生', aiManifestEvidenceRule: 'AI 资产清单与生成证据', aiPromptReferenceRule: 'Prompt 引用与版本规则',
  materialPrefix: '材质前缀', shaderPrefix: 'Shader 前缀', uniformPrefix: 'Uniform 前缀', allowedBlendModes: '允许混合模式', shaderRule: 'Shader 规则', colorSpaceRule: '色彩空间规则', mobileShaderRule: '移动端 Shader 规则', transparencyRule: '透明叠层规则', accessibilityRule: '可读性与色弱规则',
  maxBoneInfluences: '最大骨骼影响数', minimumWeight: '最小权重', normalizeWeights: '权重归一化', rootBoneName: '根骨名称', deformBoneSuffix: '形变骨后缀', assetStrategy: '角色资产策略', skeletonRule: '骨骼规则', groundingRule: '接地与锚点规则', rule: '补充规则',
  defaultSampleFps: '默认采样 FPS', maxSampleFps: '最大采样 FPS', maxSequenceFrames: '最大序列帧数', compressionTolerance: '压缩容差', rootMotionRule: 'Root Motion 规则', loopRule: '循环规则', spritePlaybackRule: '序列帧播放规则', interactionRule: '交互动画规则', downloadUiRule: '下载 UI 动画规则',
  maxParticlesPerEffect: '单特效最大粒子', maxConcurrentParticles: '最大并发粒子', maxDrawCallsPerEffect: '单特效最大 Draw Call', maxTextureSize: '最大贴图尺寸', maxDurationSeconds: '最大持续秒数', usageRule: '特效使用范围', readabilityRule: '特效可读性规则', degradeRule: '低配降级规则',
  allowedImageFormats: '允许图片格式', allowedVideoFormats: '允许视频格式', allowedAudioFormats: '允许音频格式', maxSourceFileMB: '最大源文件 MB', maxAudioFileKB: '单词音频最大 KB', minWidth: '最小宽度', minHeight: '最小高度', maxWidth: '最大宽度', maxHeight: '最大高度', runtimeMaxTextureSize: '运行时最大纹理', cityPackMaxMB: '单城市包上限 MB', cityAudioBudgetMB: '单城市音频预算 MB', minimumTouchTargetDp: '最小触控热区 dp', requiredPackFiles: '城市包必需内容', offlineAcceptance: '离线验收规则', colorAccessibility: '色弱验收规则', fontLanguageCoverage: '字体语言覆盖', requireRuntimeAlphaDeclaration: '要求声明 Alpha', maxSceneDrawCalls: '单场景最大 Draw Call', maxTextureMemoryMB: '纹理显存上限 MB', maxNativeMemoryMB: '原生峰值内存 MB', maxWebMemoryMB: 'Web峰值内存 MB', coldStartMaxSeconds: '冷启动上限秒', areaLoadMaxSeconds: '片区加载上限秒', interactionResponseMaxMs: '交互反馈上限 ms', asrFeedbackP95Ms: 'ASR反馈P95 ms', asrFalseAcceptMaxPercent: 'ASR误通过上限 %', asrTwoTrySuccessMinPercent: 'ASR两次通过率下限 %', performanceAcceptance: '性能验收场景', contentValidation: '城市内容完整性门禁',
}

function TechnicalStandardsPage({ projectId }: { projectId: string }) {
  const [standards, setStandards] = useState<TechnicalStandards | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    void fetch(`/api/technical-standards?projectId=${projectId}`).then(async (response) => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '技术规范读取失败。')
      setStandards(result)
    }).catch((loadError) => setMessage({ type: 'error', text: loadError instanceof Error ? loadError.message : '技术规范读取失败。' })).finally(() => setLoading(false))
  }, [projectId])

  const updateField = (section: keyof TechnicalStandards, key: string, value: StandardValue) => setStandards((current) => current ? { ...current, [section]: { ...(current[section] as StandardSection), [key]: value } } : current)
  const saveStandards = async () => {
    if (!standards) return
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/technical-standards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, standards: { ...standards, changeNote } }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '技术规范保存失败。')
      setStandards(result.standards)
      setChangeNote('')
      setMessage({ type: 'success', text: `规范已保存为 v${result.standards.version}，${result.impactedAssets} 个资产已标记待复核。` })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError instanceof Error ? saveError.message : '技术规范保存失败。' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取项目技术规范…</div>
  if (!standards) return <div className="registry-empty is-error"><X size={23} /> {message?.text || '技术规范不存在。'}</div>

  return (
    <div className="standards-page">
      <div className="registry-hero standards-hero">
        <div><span className="section-kicker"><Settings2 size={14} /> TECHNICAL ART CONTRACT</span><h1>技术美术衔接标准</h1><p>这是一份项目级、可版本化的 Godot 落地契约。保存新版本后，已入库资产会自动进入“待复核”，重新校验后才能继续确认。</p></div>
        <div className="standards-version"><small>当前规范</small><strong>v{standards.version}</strong><span>{new Date(standards.updatedAt).toLocaleString('zh-CN')}</span></div>
      </div>
      <div className="standards-notice"><CircleAlert size={18} /><p><strong>当前数值是可编辑基线，不等于项目最终性能预算。</strong>请按目标设备、Godot 版本和实际压测结果确认；修改会留下规范版本记录并触发资产联动复核。</p></div>
      {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}
      <div className="standards-grid">
        {standardSections.map((section) => <section className="standard-card" key={section.id}>
          <div><span>0{standardSections.indexOf(section) + 1}</span><h2>{section.title}</h2><p>{section.description}</p></div>
          <div className="standard-fields">
            {Object.entries(standards[section.id]).map(([key, value]) => <label key={key} className={typeof value === 'string' && value.length > 70 ? 'wide' : ''}><span>{standardFieldLabels[key] || key}</span>
              {typeof value === 'boolean'
                ? <input type="checkbox" checked={value} onChange={(event) => updateField(section.id, key, event.target.checked)} />
                : typeof value === 'number'
                  ? <input type="number" value={value} step="any" onChange={(event) => updateField(section.id, key, Number(event.target.value))} />
                  : Array.isArray(value)
                    ? <input value={value.join(', ')} onChange={(event) => updateField(section.id, key, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} />
                    : value.length > 70
                      ? <textarea value={value} rows={3} onChange={(event) => updateField(section.id, key, event.target.value)} />
                      : <input value={value} onChange={(event) => updateField(section.id, key, event.target.value)} />}
            </label>)}
          </div>
        </section>)}
      </div>
      <section className="standards-save-panel"><div><label><span>本次变更说明</span><input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="例如：按低配 PC 压测结果收紧粒子预算" maxLength={160} /></label><p>保存后生成 v{standards.version + 1}，历史版本不会被覆盖。</p></div><button onClick={() => void saveStandards()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} 保存新规范版本</button></section>
      <section className="standards-history"><h2>规范版本记录</h2>{[...standards.revisions].reverse().map((revision) => <div key={revision.version}><strong>v{revision.version}</strong><span>{revision.note}</span><small>{new Date(revision.updatedAt).toLocaleString('zh-CN')}</small></div>)}</section>
    </div>
  )
}

type ImageAsset = {
  id: string
  projectId: string
  moduleId: string
  name: string
  createdAt: string
  originalName: string
  size: number
  status: string
  outputDirectory: string
  imageUrl: string
}

function ImageAssetLibrary({ projectId, modules }: { projectId: string; modules: ArtModule[] }) {
  const artModules = sortModulesForDisplay(modules.filter((module) => !isGameDesignModule(module)))
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [moduleId, setModuleId] = useState('character-design')
  const [filterModule, setFilterModule] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadAssets = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const query = new URLSearchParams({ projectId })
      if (filterModule) query.set('moduleId', filterModule)
      const response = await fetch(`/api/image-assets?${query}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '无法读取图片素材。')
      setAssets(result)
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '读取失败。' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAssets() }, [projectId, filterModule])

  const uploadAssets = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (files.length === 0) return setMessage({ type: 'error', text: '请先选择图片。' })
    setSubmitting(true)
    setMessage(null)
    try {
      const formData = new FormData()
      for (const file of files) formData.append('images', file)
      formData.append('projectId', projectId)
      formData.append('moduleId', moduleId)
      formData.append('name', name || files[0].name.replace(/\.[^.]+$/, ''))
      const response = await fetch('/api/image-assets', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '图片上传失败。')
      setFiles([])
      setName('')
      setMessage({ type: 'success', text: `已保存 ${result.length} 张图片到当前项目。` })
      const input = document.getElementById('project-image-upload') as HTMLInputElement | null
      if (input) input.value = ''
      await loadAssets()
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '图片上传失败。' })
    } finally {
      setSubmitting(false)
    }
  }

  const removeAsset = async (asset: ImageAsset) => {
    if (!window.confirm(`确定删除图片“${asset.name}”吗？`)) return
    const response = await fetch(`/api/image-assets/${asset.moduleId}/${asset.id}?projectId=${projectId}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) return setMessage({ type: 'error', text: result.error || '删除失败。' })
    setAssets((current) => current.filter((item) => item.id !== asset.id))
    setMessage({ type: 'success', text: `已删除“${asset.name}”。` })
  }

  const moduleName = (id: string) => modules.find((module) => module.id === id)?.title || '未分类'

  return (
    <div className="asset-library page-enter">
      <section className="asset-library-hero">
        <div>
          <span className="eyebrow"><span /> PROJECT IMAGE ASSETS</span>
          <h1>图片素材库</h1>
          <p>所有原始图片按当前项目和美术模块独立保存，切换项目后素材库同步切换。</p>
        </div>
        <span><Image size={29} /></span>
      </section>

      <form className="asset-upload-panel" onSubmit={uploadAssets}>
        <label className={`asset-drop ${files.length ? 'has-file' : ''}`} htmlFor="project-image-upload">
          <input id="project-image-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
          <ImagePlus size={24} />
          <strong>{files.length ? `已选择 ${files.length} 张图片` : '选择图片素材'}</strong>
          <small>PNG、JPG、WebP、GIF · 单张最大 40 MB · 每次最多 12 张</small>
        </label>
        <div className="asset-upload-fields">
          <label><span>素材名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：主角正面设定图" /></label>
          <label><span>所属模块</span><select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>{artModules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
          <div><code>project-data/projects/{projectId}/assets/source/</code><button className="button primary" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{submitting ? '正在保存…' : '保存到当前项目'}</button></div>
        </div>
      </form>

      {message && <div className={`sequence-message ${message.type}`}>{message.type === 'success' ? <Check size={15} /> : <X size={15} />}{message.text}</div>}

      <section className="asset-gallery-section">
        <div className="asset-gallery-heading">
          <div><h2>项目图片</h2><span>{assets.length}</span></div>
          <select value={filterModule} onChange={(event) => setFilterModule(event.target.value)}><option value="">全部模块</option>{artModules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select>
        </div>
        {loading ? <div className="asset-empty"><LoaderCircle className="spin" size={23} /> 正在读取素材…</div> : assets.length === 0 ? <div className="asset-empty"><Image size={27} /><strong>当前项目还没有图片素材</strong><p>上传的图片只会保存在当前项目中。</p></div> : (
          <div className="asset-grid">{assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <a href={asset.imageUrl} target="_blank" rel="noreferrer"><img src={asset.imageUrl} alt={asset.name} /></a>
              <div><small>{moduleName(asset.moduleId)}</small><h3>{asset.name}</h3><p>{asset.originalName}</p></div>
              <footer><code>{asset.outputDirectory}</code><button onClick={() => void removeAsset(asset)}><Trash2 size={14} /></button></footer>
            </article>
          ))}</div>
        )}
      </section>
    </div>
  )
}

function Dashboard({ modules, onResetAll }: { modules: ArtModule[]; onResetAll: () => void }) {
  const gameplayModule = modules.find((module) => module.id === 'gameplay-design')
  const gameDesignModules = sortModulesForDisplay(modules.filter(isGameDesignModule))
  const artModules = sortModulesForDisplay(modules.filter((module) => !isGameDesignModule(module)))
  const topLevelArtModules = artModules.filter((module) => !isStoryLevelChild(module))
  const storyLevelModule = modules.find((module) => module.id === 'story-level-design')
  const storyLevelChildren = storyLevelChildIds.map((id) => modules.find((module) => module.id === id)).filter((module): module is ArtModule => Boolean(module))
  const sectionCount = modules.reduce((total, module) => total + module.sections.length, 0)
  const itemCount = modules.reduce(
    (total, module) => total + module.sections.reduce((subtotal, section) => subtotal + section.items.length, 0),
    0,
  )

  const handleReset = () => {
    if (window.confirm('确定恢复全部项目模块的默认内容吗？你当前的手动修改将被清除。')) onResetAll()
  }

  return (
    <div className="dashboard page-enter">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow"><span /> GAME PRODUCTION OS · V0.1</span>
          <h1>从玩法事实，到<br /><em>可执行的美术生产语言。</em></h1>
          <p>先记录产品定位与范围边界，再把玩法展开为可执行的结构、流程和系统规则，据此建立主视觉与各类美术资产的制作标准。全部内容按项目独立保存并可手动修改。</p>
          <div className="hero-actions">
            <Link className="button primary" to={`/modules/${gameplayModule?.id || modules[0].id}`}>进入玩法设计 <ArrowRight size={17} /></Link>
            <button className="button ghost" onClick={handleReset}><RotateCcw size={16} /> 恢复全部默认</button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="visual-card card-one"><UserRound size={27} /><span>IDENTITY</span></div>
          <div className="visual-card card-two"><Sparkles size={25} /><span>RULES</span></div>
          <div className="visual-card card-three"><Layers3 size={26} /><span>RUNTIME</span></div>
          <div className="visual-core"><WandSparkles size={35} /><small>AI ART<br />PIPELINE</small></div>
        </div>
      </section>

      <section className="stats-row" aria-label="平台统计">
        <Stat icon={<FolderKanban size={20} />} label="项目模块" value={String(modules.length + 1).padStart(2, '0')} detail="项目计划 + 游戏设计 + 美术生产" />
        <Stat icon={<Layers3 size={20} />} label="内容分组" value={String(sectionCount).padStart(2, '0')} detail="项目级可编辑记录" />
        <Stat icon={<ShieldCheck size={20} />} label="记录与规则" value={String(itemCount)} detail="玩法事实、规格与门禁" />
        <Stat icon={<CircleGauge size={20} />} label="配置状态" value="LOCAL" detail="自动保存到本地" />
      </section>

      {gameDesignModules.length > 0 && <section className="modules-section gameplay-module-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><span /> GAME DESIGN FOUNDATION</span>
            <h2>游戏设计与项目计划</h2>
          </div>
          <p>先定义宏观范围与详细规则，再用项目计划持续跟踪实现任务、负责人、进度和验收。</p>
        </div>
        <div className="module-grid gameplay-module-grid">
          {gameDesignModules.map((module) => <ModuleCard key={module.id} module={module} />)}
          <Link to="/city-content-management" className="module-card" style={{ '--accent': '#567a92', '--tint': '#edf4f7' } as AccentStyle}>
            <div className="module-card-top">
              <span className="module-card-icon"><MapPinned size={25} strokeWidth={1.8} /></span>
              <span className="module-number">CITY</span>
            </div>
            <small>City Content Catalog</small>
            <h3>城市内容管理</h3>
            <p>按城市维护实际的片区、宝箱、核心词汇与宠物内容，并与详细玩法的通用规则分离。</p>
            <div className="module-meta">
              <span><Layers3 size={14} /> 内容实例</span>
              <span><ClipboardList size={14} /> 范围追踪</span>
            </div>
            <div className="module-link">查看并维护城市内容 <ArrowRight size={17} /></div>
          </Link>
          <Link to="/pet-content-management" className="module-card" style={{ '--accent': '#8b6b46', '--tint': '#f7f1e8' } as AccentStyle}>
            <div className="module-card-top">
              <span className="module-card-icon"><PawPrint size={25} strokeWidth={1.8} /></span>
              <span className="module-number">PET</span>
            </div>
            <small>Pet Content Catalog</small>
            <h3>宠物内容管理</h3>
            <p>维护宠物的唯一内容定义，并由各城市引用为宝箱或探索奖励。</p>
            <div className="module-meta">
              <span><Layers3 size={14} /> 统一定义</span>
              <span><Link2 size={14} /> 城市引用</span>
            </div>
            <div className="module-link">查看并维护宠物内容 <ArrowRight size={17} /></div>
          </Link>
          <Link to="/game-content-management" className="module-card" style={{ '--accent': '#6276a5', '--tint': '#edf0f8' } as AccentStyle}>
            <div className="module-card-top">
              <span className="module-card-icon"><Gamepad2 size={25} strokeWidth={1.8} /></span>
              <span className="module-number">GAME</span>
            </div>
            <small>Interactive Game Catalog</small>
            <h3>游戏管理</h3>
            <p>维护可复用的语言互动与小游戏内容，并由各城市按片区或宝箱引用。</p>
            <div className="module-meta">
              <span><Layers3 size={14} /> 统一定义</span>
              <span><Link2 size={14} /> 城市引用</span>
            </div>
            <div className="module-link">查看并维护游戏内容 <ArrowRight size={17} /></div>
          </Link>
          <Link to="/project-plan" className="module-card" style={{ '--accent': '#65758a', '--tint': '#edf1f5' } as AccentStyle}>
            <div className="module-card-top">
              <span className="module-card-icon"><ClipboardList size={25} strokeWidth={1.8} /></span>
              <span className="module-number">PLAN</span>
            </div>
            <small>Project Implementation Plan</small>
            <h3>项目计划</h3>
            <p>编辑和监控项目实现计划，按阶段维护任务、负责人、状态、进度、日期与验收规则。</p>
            <div className="module-meta">
              <span><Layers3 size={14} /> 阶段化管理</span>
              <span><CircleGauge size={14} /> 进展监控</span>
            </div>
            <div className="module-link">查看并维护项目计划 <ArrowRight size={17} /></div>
          </Link>
        </div>
      </section>}

      <section className="modules-section art-modules-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><span /> PRODUCTION MODULES</span>
            <h2>九个美术生产模块</h2>
          </div>
          <p>每个模块都有独立的产出清单、制作规格、AI约束和验收门禁。</p>
        </div>

        <div className="module-grid">
          {topLevelArtModules.map((module) => <ModuleCard key={module.id} module={module} />)}
        </div>
        {storyLevelModule && <StoryLevelModuleGroup parent={storyLevelModule} children={storyLevelChildren} />}
      </section>

      <section className="handoff-strip">
        <div>
          <span className="eyebrow light"><span /> HANDOFF MAP</span>
          <h2>从玩法定义到引擎资产</h2>
        </div>
        <div className="handoff-flow">
          {sortModulesForDisplay(modules).map((module, index, orderedModules) => (
            <div className="handoff-step" key={module.id}>
              <span style={{ background: module.accent }}>{module.id === 'gameplay-design' ? 'UP' : module.id === 'detailed-gameplay-design' ? 'DT' : `0${module.order}`}</span>
              <strong>{module.title}</strong>
              {index < orderedModules.length - 1 && <ArrowRight size={16} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  )
}

function StoryLevelModuleGroup({ parent, children }: { parent: ArtModule; children: ArtModule[] }) {
  const ParentIcon = moduleIcons[parent.icon]
  return (
    <section className="story-module-group" style={{ '--accent': parent.accent, '--tint': parent.tint } as AccentStyle}>
      <Link className="story-module-group-header" to={`/modules/${parent.id}`}>
        <span><ParentIcon size={22} /></span>
        <div><small>剧情关卡设计 · 功能模块</small><strong>以下模块归属于剧情关卡设计</strong><p>剧情关卡负责定义场景功能与空间动线，背景和地图元素负责将其制作成正式美术资产。</p></div>
        <span className="story-child-count">{children.length} 个功能模块</span>
        <ChevronRight size={17} />
      </Link>
      <div className="story-child-modules">
        {children.map((child, index) => (
          <div className="story-child-module" key={child.id}>
            <ModuleCard module={child} />
            {index < children.length - 1 && <span className="story-child-relation"><small>制作引用</small><ArrowRight size={17} /></span>}
          </div>
        ))}
      </div>
    </section>
  )
}

function ModuleCard({ module }: { module: ArtModule }) {
  const isGameplay = isGameDesignModule(module)
  const Icon = moduleIcons[module.icon]
  const style = { '--accent': module.accent, '--tint': module.tint } as AccentStyle
  const requirements = module.sections.reduce((count, section) => count + section.items.length, 0)
  return (
    <Link to={`/modules/${module.id}`} className="module-card" style={style}>
      <div className="module-card-top">
        <span className="module-card-icon"><Icon size={25} strokeWidth={1.8} /></span>
        <span className="module-number">{module.id === 'gameplay-design' ? 'UPSTREAM' : module.id === 'detailed-gameplay-design' ? 'DETAILED' : `0${module.order}`}</span>
      </div>
      <small>{module.englishTitle}</small>
      <h3>{module.title}</h3>
      <p>{module.shortDescription}</p>
      <div className="module-meta">
        <span><Layers3 size={14} /> {module.sections.length} {isGameplay ? '组记录' : '组要求'}</span>
        <span><Check size={14} /> {requirements} {isGameplay ? '项内容' : '条规则'}</span>
      </div>
      <div className="module-link">{isGameplay ? `查看并修改${module.title}` : '查看设计要求'} <ArrowRight size={17} /></div>
    </Link>
  )
}

function ModuleDetail({
  modules,
  updateModule,
  resetModule,
  projectId,
  requirementsMode = false,
}: {
  modules: ArtModule[]
  updateModule: (moduleId: string, updater: (module: ArtModule) => ArtModule) => void
  resetModule: (moduleId: string) => void
  projectId: string
  requirementsMode?: boolean
}) {
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const module = modules.find((candidate) => candidate.id === moduleId)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [completedAssetsRevision, setCompletedAssetsRevision] = useState(0)

  useEffect(() => {
    setEditingSectionId(null)
    setCompletedAssetsRevision(0)
  }, [projectId, moduleId, requirementsMode])

  const adjacent = useMemo(() => {
    if (!module) return { previous: undefined, next: undefined }
    const orderedModules = sortModulesForDisplay(modules)
    const index = orderedModules.findIndex((candidate) => candidate.id === module.id)
    return { previous: orderedModules[index - 1], next: orderedModules[index + 1] }
  }, [module, modules])

  if (!module) return <Navigate to="/" replace />
  const Icon = moduleIcons[module.icon]
  const isGameplay = isGameDesignModule(module)
  const isGameplayFoundation = module.id === 'gameplay-design'
  const isDetailedGameplay = module.id === 'detailed-gameplay-design'
  const isModuleOverview = !requirementsMode
  const mainVisualModule = modules.find((candidate) => candidate.id === 'main-visual-design')
  const editPath = `/modules/${module.id}/requirements`
  const style = { '--accent': module.accent, '--tint': module.tint } as AccentStyle

  if (isGameplay && requirementsMode) return <Navigate to={`/modules/${module.id}`} replace />

  const saveSection = (section: RequirementSection) => {
    updateModule(module.id, (current) => ({
      ...current,
      sections: current.sections.map((item) => (item.id === section.id ? section : item)),
    }))
    setEditingSectionId(null)
  }

  const addSection = () => {
    const id = `custom-${Date.now()}`
    const newSection: RequirementSection = {
      id,
      label: `${String(module.sections.length + 1).padStart(2, '0')} / ${isGameplay ? '自定义记录' : '自定义要求'}`,
      title: isGameplay ? '新增玩法记录分组' : '新增要求分组',
      description: isGameplay ? '补充当前项目需要持续维护的玩法设计事实。' : '补充这个模块需要遵循的项目专属要求。',
      items: [isGameplay ? '在这里填写第一条玩法设计记录' : '在这里填写第一条要求'],
    }
    updateModule(module.id, (current) => ({ ...current, sections: [...current.sections, newSection] }))
    setEditingSectionId(id)
  }

  const removeSection = (sectionId: string) => {
    if (!window.confirm(`确定删除这一组${isGameplay ? '玩法记录' : '要求'}吗？`)) return
    updateModule(module.id, (current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId),
    }))
    setEditingSectionId(null)
  }

  const handleReset = () => {
    if (!window.confirm(`确定恢复“${module.title}”的默认${isGameplay ? '记录' : '要求'}吗？`)) return
    resetModule(module.id)
    setEditingSectionId(null)
  }

  const sortSectionsByLabelNumber = () => {
    const getLabelNumber = (section: RequirementSection) => {
      const match = section.label.match(/^\s*(\d+)/)
      return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY
    }
    updateModule(module.id, (current) => ({
      ...current,
      sections: [...current.sections].sort((first, second) => getLabelNumber(first) - getLabelNumber(second)),
    }))
  }

  return (
    <div className="module-detail page-enter" style={style}>
      <button className="back-link" onClick={() => navigate(requirementsMode ? `/modules/${module.id}` : '/')}>
        <ArrowLeft size={16} /> {requirementsMode ? `返回${module.title}` : '返回模块总览'}
      </button>

      <section className="detail-hero">
        <div className="detail-hero-main">
          <div className="detail-icon">{requirementsMode ? <BookOpenCheck size={35} strokeWidth={1.65} /> : <Icon size={35} strokeWidth={1.65} />}</div>
          <div className="detail-title">
            <span className="eyebrow"><span /> MODULE {isGameplay ? 'UPSTREAM' : `0${module.order}`} · {requirementsMode ? `${module.englishTitle.toUpperCase()} ${isGameplay ? 'RECORD' : 'REQUIREMENTS'}` : module.englishTitle.toUpperCase()}</span>
            <h1>{requirementsMode ? (isGameplay ? `编辑${module.title}` : `${module.title}要求`) : module.title}</h1>
            <p>{requirementsMode ? (isGameplay ? '记录和修改当前项目的产品定位、世界观、玩法类型与目标平台。' : `维护${module.title}的产出物、制作规格、生成约束与验收门禁；这里的要求将直接作为 AI 生成依据。`) : module.shortDescription}</p>
          </div>
          {(!isModuleOverview || !isGameplay) && (
            <div className="detail-actions">
              {isModuleOverview ? (
                <Link className="button primary" to={editPath}><BookOpenCheck size={17} /> {module.title}要求</Link>
              ) : (
                <>
                  <button className="button ghost" onClick={handleReset}><RotateCcw size={16} /> 恢复默认</button>
                  <button className="button primary" onClick={addSection}><Plus size={17} /> 新增要求分组</button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="module-brief">
          <div><span>{isGameplay ? '记录目标' : '模块目标'}</span><strong>{module.objective}</strong></div>
          <div><span>{isGameplay ? '输入依据' : '上游依赖'}</span><strong>{module.dependsOn}</strong></div>
          <div><span>{isGameplay ? '下游影响' : '下游交付'}</span><strong>{module.handoff}</strong></div>
        </div>
      </section>

      <div className="module-authority-grid">
        {isStoryLevelChild(module) && (
          <Link className="parent-module-authority" to="/modules/story-level-design">
            <span><MapPinned size={19} /></span>
            <div><small>所属父模块 · 剧情关卡设计</small><strong>{module.title}是剧情关卡设计下的功能模块</strong><p>场景功能、空间动线、叙事节拍与关卡需求以剧情关卡设计模块为准。</p></div>
            <ArrowLeft size={18} />
          </Link>
        )}

        {isGameplayFoundation ? (
          <Link className="gameplay-authority master" to="/modules/detailed-gameplay-design">
            <span><CircleGauge size={19} /></span>
            <div><small>GAMEPLAY SCOPE SOURCE</small><strong>玩法设计为详细玩法设计提供范围边界</strong><p>产品定位、世界观、核心循环、特色机制、资产规模与目标平台会在详细玩法设计中展开为可执行规则。</p></div>
            <ArrowRight size={18} />
          </Link>
        ) : isDetailedGameplay ? (
          <>
            <Link className="gameplay-authority" to="/modules/gameplay-design">
              <span><CircleGauge size={19} /></span>
              <div><small>上游依赖 · 玩法设计</small><strong>详细规则必须遵守玩法设计的范围边界</strong><p>角色数量、特色机制、关卡规模、多人模式与目标平台以玩法设计模块的当前记录为准。</p></div>
              <ArrowLeft size={18} />
            </Link>
            <Link className="style-authority master" to="/modules/main-visual-design">
              <span><GitBranch size={19} /></span>
              <div><small>DETAILED GAMEPLAY FACT SOURCE</small><strong>这里是下游制作使用的详细玩法事实源</strong><p>操作状态、动作时序、战斗技能、多人协作、关卡遭遇、成长经济和异常流程将约束美术与技术实现。</p></div>
              <ArrowRight size={18} />
            </Link>
          </>
        ) : module.id === 'main-visual-design' ? (
          <>
            <Link className="gameplay-authority" to="/modules/detailed-gameplay-design">
              <span><GitBranch size={19} /></span>
              <div><small>上游依赖 · 详细玩法设计</small><strong>主视觉必须同时读取范围与详细玩法事实</strong><p>项目定位以玩法设计为准；镜头、状态、关卡、技能、多人协作与反馈需求以详细玩法设计为准。</p></div>
              <ArrowLeft size={18} />
            </Link>
            <div className="style-authority master">
              <span><Palette size={19} /></span>
              <div><small>PROJECT STYLE SOURCE</small><strong>这是当前项目全部美术设计的主视觉事实源</strong><p>角色、动作、技能、场景、地图元素、UI和剧情关卡均应继承这里批准的风格规则。</p></div>
              <ShieldCheck size={21} />
            </div>
          </>
        ) : (
          <Link className="style-authority" to="/modules/main-visual-design">
            <span><Palette size={19} /></span>
            <div><small>受主视觉设计约束</small><strong>当前模块继承项目主视觉风格</strong><p>色板、材质、光照、镜头和生成约束以主视觉模块中的美术设计要求为准。</p></div>
            <ArrowRight size={18} />
          </Link>
        )}
      </div>

      {isModuleOverview && module.id === 'main-visual-design' && (
        <VisualInfluenceMap modules={modules} />
      )}

      {!requirementsMode && (module.id === 'character-motion' || module.id === 'skill-vfx') && (
        <FrameSequenceStudio
          projectId={projectId}
          moduleId={module.id}
          moduleTitle={module.title}
          accent={module.accent}
          tint={module.tint}
          onPromoted={() => setCompletedAssetsRevision((current) => current + 1)}
        />
      )}

      {isModuleOverview && module.id === 'story-level-design' && (
        <StoryLevelDetailSubmodules modules={modules} />
      )}

      {isModuleOverview ? (
        isGameplay ? (
          <GameplayDesignRecord
            module={module}
            editingSectionId={editingSectionId}
            onEdit={setEditingSectionId}
            onSave={saveSection}
            onCancel={() => setEditingSectionId(null)}
            onDelete={removeSection}
            onAdd={addSection}
            onReset={handleReset}
            onSort={sortSectionsByLabelNumber}
          />
        ) : <CompletedModuleDesigns module={module} projectId={projectId} revision={completedAssetsRevision} />
      ) : (
        <>
          <AiPromptRecord
            module={module}
            projectId={projectId}
            inheritedPrompt={module.id === 'main-visual-design' ? undefined : mainVisualModule?.aiPrompt}
            onSave={(aiPrompt) => updateModule(module.id, (current) => ({ ...current, aiPrompt }))}
          />

          {module.id === 'main-visual-design' && (
            <MainVisualDeliverablesPanel projectId={projectId} staticDemo={isStaticDemo} />
          )}

          {module.id === 'character-design' && (
            <CharacterSettingSheetsPanel projectId={projectId} staticDemo={isStaticDemo} />
          )}

          <div className="requirements-heading">
            <div>
              <span className="eyebrow"><span /> {isGameplay ? 'EDITABLE GAMEPLAY RECORD' : 'EDITABLE REQUIREMENTS'}</span>
              <h2>{isGameplay ? '玩法设计记录' : '美术设计要求'}</h2>
            </div>
            <p><PencilLine size={15} /> 点击每组右上角“编辑”，可修改标题、说明及全部{isGameplay ? '记录' : '条目'}。</p>
          </div>

          <div className="requirements-list">
            {module.sections.map((section, index) =>
              editingSectionId === section.id ? (
                <SectionEditor
                  key={section.id}
                  section={section}
                  accent={module.accent}
                  recordMode={isGameplay}
                  onSave={saveSection}
                  onCancel={() => setEditingSectionId(null)}
                  onDelete={() => removeSection(section.id)}
                />
              ) : (
                <RequirementCard
                  key={section.id}
                  section={section}
                  index={index}
                  onEdit={() => setEditingSectionId(section.id)}
                />
              ),
            )}
          </div>
        </>
      )}

      {!requirementsMode && <section className="detail-footer-nav">
        {adjacent.previous ? (
          <Link to={`/modules/${adjacent.previous.id}`}>
            <ArrowLeft size={18} />
            <span><small>上一个模块</small><strong>{adjacent.previous.title}</strong></span>
          </Link>
        ) : <span />}
        {adjacent.next ? (
          <Link to={`/modules/${adjacent.next.id}`} className="next">
            <span><small>下一个模块</small><strong>{adjacent.next.title}</strong></span>
            <ArrowRight size={18} />
          </Link>
        ) : <Link to="/" className="next"><span><small>完成浏览</small><strong>返回模块总览</strong></span><LayoutDashboard size={18} /></Link>}
      </section>}
    </div>
  )
}

const emptyAiPrompt: AiPromptProfile = {
  prompt: '',
  negativePrompt: '',
  modelAndParameters: '',
  referenceNotes: '',
  updatedAt: '',
}

function AiPromptRecord({
  module,
  projectId,
  inheritedPrompt,
  onSave,
}: {
  module: ArtModule
  projectId: string
  inheritedPrompt?: AiPromptProfile
  onSave: (profile: AiPromptProfile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AiPromptProfile>(module.aiPrompt || emptyAiPrompt)
  const [promptError, setPromptError] = useState('')
  const isMainVisual = module.id === 'main-visual-design'
  const isEditing = isMainVisual || editing
  const profile = module.aiPrompt || emptyAiPrompt

  useEffect(() => {
    setEditing(false)
    setDraft(module.aiPrompt || emptyAiPrompt)
  }, [module.id, module.aiPrompt])

  const savePrompt = () => {
    if (isMainVisual && /\basset-\d{13}-[a-f0-9]{8}\b/i.test(draft.referenceNotes)) {
      setPromptError('参考备注会自动解析交付物图片，请不要手工填写资产 ID。')
      return
    }
    setPromptError('')
    onSave({
      prompt: draft.prompt.trim(),
      negativePrompt: draft.negativePrompt.trim(),
      modelAndParameters: draft.modelAndParameters.trim(),
      referenceNotes: draft.referenceNotes.trim(),
      updatedAt: new Date().toISOString(),
    })
  }

  const fieldCopy = isMainVisual
    ? {
        prompt: '项目级基础 Prompt',
        negativePrompt: '项目共享负面 Prompt',
        modelAndParameters: 'AI 生成参数与画布（不含技术接入）',
        referenceNotes: '参考优先级与排除规则',
      }
    : {
        prompt: `${module.title}补充 Prompt`,
        negativePrompt: `${module.title}专属负面 Prompt`,
        modelAndParameters: '模块参数补充或覆盖',
        referenceNotes: '模块追加参考输入与排除备注',
      }

  return (
    <section
      className={`ai-prompt-record${isMainVisual ? ' is-master' : ''}`}
      data-purpose="ai-generation-prompt"
      data-module-id={module.id}
      data-inherits-from={isMainVisual ? undefined : 'main-visual-design'}
      aria-labelledby={`ai-prompt-title-${module.id}`}
    >
      <header>
        <div className="ai-prompt-heading-icon"><WandSparkles size={20} /></div>
        <div>
          <span>{isMainVisual ? 'PROJECT AI PROMPT SOURCE' : 'MODULE AI PROMPT PROFILE'}</span>
          <h2 id={`ai-prompt-title-${module.id}`}>{isMainVisual ? '项目主视觉 Prompt 母版' : `${module.title} Prompt 记录`}</h2>
          <p>{isMainVisual ? '这里是全部美术模块共同继承的生成基线；主视觉未批准前不得将它视为正式批量生产许可。' : '生成时先读取主视觉母版，再追加本模块内容；模块补充不得改写项目级镜头、材质、光照和色彩规则。'}</p>
        </div>
        {!isEditing && <button className="edit-button" onClick={() => { setDraft(profile); setEditing(true) }}><PencilLine size={14} /> 编辑 Prompt</button>}
      </header>

      {isMainVisual && <MainVisualReferenceImages projectId={projectId} />}

      {!isMainVisual && (
        <div className="ai-prompt-inheritance">
          <div className="ai-prompt-inheritance-title">
            <GitBranch size={15} />
            <span><strong>继承自主视觉设计</strong><small>以下内容只读，不复制到模块字段</small></span>
          </div>
          <PromptValue label="项目级基础 Prompt" value={inheritedPrompt?.prompt} empty="主视觉基础 Prompt 尚未填写" />
          <PromptValue label="项目共享负面 Prompt" value={inheritedPrompt?.negativePrompt} empty="主视觉共享负面 Prompt 尚未填写" />
          <PromptValue label="统一模型与生成参数" value={inheritedPrompt?.modelAndParameters} empty="主视觉模型与参数尚未锁定" />
          <PromptValue label="项目参考输入、优先级与排除备注" value={inheritedPrompt?.referenceNotes} empty="主视觉参考输入尚未登记" />
        </div>
      )}

      {!isMainVisual && <MainVisualReferenceImages projectId={projectId} compact />}

      {isEditing ? (
        <div className="ai-prompt-editor">
          <PromptEditorField label={fieldCopy.prompt} value={draft.prompt} rows={7} onChange={(prompt) => setDraft({ ...draft, prompt })} />
          <PromptEditorField label={fieldCopy.negativePrompt} value={draft.negativePrompt} rows={5} onChange={(negativePrompt) => setDraft({ ...draft, negativePrompt })} />
          <PromptEditorField label={fieldCopy.modelAndParameters} hint={isMainVisual ? '只填写模型、Seed、参考权重、采样和概念图画布；格式、压缩、导入与运行时限制引用技术美术规范。' : undefined} value={draft.modelAndParameters} rows={4} onChange={(modelAndParameters) => setDraft({ ...draft, modelAndParameters })} />
          <PromptEditorField label={fieldCopy.referenceNotes} hint={isMainVisual ? '只填写参考优先级、冲突处理和不可复制元素；图片、资产 ID、版本、权利与技术状态自动读取交付物和资产注册中心。' : undefined} value={draft.referenceNotes} rows={4} onChange={(referenceNotes) => { setDraft({ ...draft, referenceNotes }); setPromptError('') }} />
          {promptError && <p className="ai-prompt-editor-error"><CircleAlert size={14} />{promptError}</p>}
          <div className="ai-prompt-editor-actions">
            <button className="button ghost" onClick={() => { setDraft(profile); setEditing(false) }}>{isMainVisual ? '重置' : '取消'}</button>
            <button className="button primary" onClick={savePrompt}><Save size={16} /> 保存 Prompt</button>
          </div>
        </div>
      ) : (
        <div className="ai-prompt-values">
          <PromptValue label={fieldCopy.prompt} value={profile.prompt} />
          <PromptValue label={fieldCopy.negativePrompt} value={profile.negativePrompt} />
          <PromptValue label={fieldCopy.modelAndParameters} value={profile.modelAndParameters} />
          <PromptValue label={fieldCopy.referenceNotes} value={profile.referenceNotes} />
          <small className="ai-prompt-updated">{profile.updatedAt ? `最后更新：${new Date(profile.updatedAt).toLocaleString('zh-CN')}` : '尚未保存结构化 Prompt'}</small>
        </div>
      )}
    </section>
  )
}

type MainVisualReferenceDeliverable = {
  id: string
  title: string
  imageAssetIds: string[]
}

const mainVisualReferenceRoles = [
  {
    deliverableId: 'gameplay-anchor',
    label: '游戏内参考',
    weight: '建议权重约 65%',
    purpose: '负责游戏镜头、空间尺度、可行走地面和交互可读性。',
  },
  {
    deliverableId: 'key-visual',
    label: '宣传参考',
    weight: '建议权重约 35%',
    purpose: '负责宣传构图、角色完成度和展示性光效，不覆盖游戏镜头规则。',
  },
] as const

function MainVisualReferenceImages({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [deliverables, setDeliverables] = useState<MainVisualReferenceDeliverable[]>([])
  const [loading, setLoading] = useState(true)
  const [showReferenceImages, setShowReferenceImages] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadReferences = async () => {
    if (!projectId || isStaticDemo) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const query = new URLSearchParams({ projectId, moduleId: 'main-visual-design' })
      const [assetsResponse, deliverablesResponse] = await Promise.all([
        fetch(`/api/image-assets?${query}`),
        fetch(`/api/projects/${projectId}/main-visual-deliverables`),
      ])
      const [assetsResult, deliverablesResult] = await Promise.all([assetsResponse.json(), deliverablesResponse.json()])
      if (!assetsResponse.ok) throw new Error(assetsResult.error || '无法读取主视觉参考图片。')
      if (!deliverablesResponse.ok) throw new Error(deliverablesResult.error || '无法读取主视觉交付物。')
      setAssets(assetsResult)
      setDeliverables(deliverablesResult.items || [])
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '读取主视觉参考图片失败。' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadReferences() }, [projectId])

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const resolvedReferences = useMemo(() => mainVisualReferenceRoles.map((role) => {
    const deliverable = deliverables.find((item) => item.id === role.deliverableId)
    return { ...role, deliverable, assetIds: deliverable?.imageAssetIds || [] }
  }), [deliverables])

  return (
    <div className={`prompt-reference-images${compact ? ' is-compact' : ''}`} data-purpose="ai-generation-reference-images">
      {!compact && (
        <div className="prompt-reference-heading">
          <div><ImagePlus size={17} /><span><strong>主视觉交付图片汇总</strong><small>图片与交付正文均在下方具体交付物中维护</small></span></div>
          <div className="prompt-reference-actions"><button type="button" onClick={() => setShowReferenceImages((current) => !current)}>{showReferenceImages ? '收起图片' : '展开图片'} <ChevronRight className={showReferenceImages ? 'is-expanded' : ''} size={13} /></button><Link to="/assets">在图片素材库管理 <ArrowRight size={13} /></Link></div>
        </div>
      )}

      {message?.type === 'error' && <div className="sequence-message error"><X size={15} />{message.text}</div>}

      <div className="prompt-resolved-references" data-purpose="resolved-main-visual-reference-inputs">
        <div className="prompt-resolved-heading"><Link2 size={15} /><span><strong>自动解析参考输入</strong><small>直接读取 03／04 号交付物当前绑定图片，不在 Prompt 文本中复制资产 ID</small></span></div>
        <div className="prompt-resolved-grid">
          {resolvedReferences.map((reference) => (
            <article key={reference.deliverableId} data-reference-role={reference.deliverableId}>
              <header><span>{reference.label}</span><small>{reference.weight}</small></header>
              <strong>{reference.deliverable?.title || `${reference.deliverableId} 尚未建立`}</strong>
              <p>{reference.purpose}</p>
              <div>
                {reference.assetIds.length ? reference.assetIds.map((assetId) => {
                  const asset = assetById.get(assetId)
                  return asset ? <a key={assetId} href={asset.imageUrl} target="_blank" rel="noreferrer"><Image size={13} /><code>{assetId}</code></a> : <span key={assetId} className="missing"><CircleAlert size={13} /><code>{assetId}</code></span>
                }) : <span className="missing"><CircleAlert size={13} />尚未绑定图片</span>}
              </div>
            </article>
          ))}
        </div>
      </div>

      {!compact && (!showReferenceImages ? (
        <button type="button" className="prompt-reference-toggle" onClick={() => setShowReferenceImages(true)}><Image size={18} /><span>图片区域已收起{assets.length ? ` · ${assets.length} 张图片` : ''}</span><ChevronRight size={15} /></button>
      ) : loading ? (
        <div className="prompt-reference-empty"><LoaderCircle className="spin" size={18} /> 正在读取参考图片…</div>
      ) : assets.length === 0 ? (
        <div className="prompt-reference-empty"><Image size={20} /><span>下方交付物尚未绑定主视觉图片</span></div>
      ) : (
        <div className="prompt-reference-grid">
          {assets.map((asset) => (
            <a key={asset.id} href={asset.imageUrl} target="_blank" rel="noreferrer" data-reference-image-id={asset.id}>
              <img src={asset.imageUrl} alt={asset.name} />
              <span><strong>{asset.name}</strong><small>{asset.originalName} · source/draft</small></span>
            </a>
          ))}
        </div>
      ))}
    </div>
  )
}

function PromptValue({ label, value, empty = '尚未填写' }: { label: string; value?: string; empty?: string }) {
  return (
    <div className={`ai-prompt-value${value ? '' : ' is-empty'}`}>
      <span>{label}</span>
      <pre>{value || empty}</pre>
    </div>
  )
}

function PromptEditorField({ label, hint, value, rows, onChange }: { label: string; hint?: string; value: string; rows: number; onChange: (value: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function StoryLevelDetailSubmodules({ modules }: { modules: ArtModule[] }) {
  const children = storyLevelChildIds.map((id) => modules.find((module) => module.id === id)).filter((module): module is ArtModule => Boolean(module))
  return (
    <section className="story-detail-submodules">
      <div className="story-detail-submodules-heading">
        <div>
          <span className="eyebrow"><span /> LEVEL ART FUNCTION MODULES</span>
          <h2>剧情关卡功能模块</h2>
          <p>背景设计与背景地图元素设计归属于当前模块，并按关卡需求完成场景美术生产。</p>
        </div>
        <span>{children.length} 个功能模块</span>
      </div>
      <div className="story-detail-submodule-flow">
        {children.map((child, index) => (
          <div className="story-detail-submodule-step" key={child.id}>
            <ModuleCard module={child} />
            {index < children.length - 1 && <span><small>背景规范传递</small><ArrowRight size={18} /></span>}
          </div>
        ))}
      </div>
    </section>
  )
}

function GameplayDesignRecord({
  module,
  editingSectionId,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onAdd,
  onReset,
  onSort,
}: {
  module: ArtModule
  editingSectionId: string | null
  onEdit: (sectionId: string) => void
  onSave: (section: RequirementSection) => void
  onCancel: () => void
  onDelete: (sectionId: string) => void
  onAdd: () => void
  onReset: () => void
  onSort: () => void
}) {
  return (
    <section className="gameplay-records">
      <div className="gameplay-records-heading">
        <div>
          <span className="eyebrow"><span /> {module.id === 'detailed-gameplay-design' ? 'DETAILED GAMEPLAY SPECIFICATION' : 'CURRENT GAMEPLAY FACTS'}</span>
          <h2>当前{module.title}记录</h2>
          <p>{module.id === 'detailed-gameplay-design' ? '这里记录可直接交给程序、美术、关卡与测试执行的玩法结构、流程、规则和边界情况。' : '这里展示当前项目正在使用的宏观玩法事实与范围边界，不代表美术素材或已完成资产。'}</p>
        </div>
        <div className="gameplay-record-actions">
          <button className="button ghost" onClick={onSort}><ArrowUpNarrowWide size={16} /> 按序号排序</button>
          <button className="button ghost" onClick={onReset}><RotateCcw size={16} /> 恢复默认</button>
          <button className="button primary" onClick={onAdd}><Plus size={17} /> 新增记录分组</button>
        </div>
      </div>
      <div className="gameplay-record-grid">
        {module.sections.map((section) =>
          editingSectionId === section.id ? (
            <SectionEditor
              key={section.id}
              section={section}
              accent={module.accent}
              recordMode
              onSave={onSave}
              onCancel={onCancel}
              onDelete={() => onDelete(section.id)}
            />
          ) : (
            <article className="gameplay-record-card" key={section.id}>
              <header>
                <div><small>{section.label}</small><h3>{section.title}</h3><p>{section.description}</p></div>
                <button className="edit-button" onClick={() => onEdit(section.id)}><PencilLine size={14} /> 编辑</button>
              </header>
              <ul>
                {section.items.map((item, index) => <li key={`${section.id}-${index}`}><Check size={12} />{item}</li>)}
              </ul>
            </article>
          ),
        )}
      </div>
    </section>
  )
}

const visualInfluenceRules: Record<string, string> = {
  'character-design': '比例轮廓 · 色彩材质 · 服装母题',
  'character-motion': '镜头基准 · 动态轮廓 · 节奏倾向',
  'skill-design': '功能色语义 · 形状语言 · 力量层级',
  'skill-vfx': '发光色域 · 粒子材质 · 明暗层级',
  'background-design': '透视镜头 · 环境色板 · 光照气氛',
  'map-elements': '尺度体系 · 表面材质 · 接地阴影',
  'game-ui': '功能色 · 形状组件 · 纹理细节',
  'story-level-design': '情绪色板 · 场景构图 · 叙事光线',
}

const visualInfluenceRows = [
  { first: 'character-design', second: 'character-motion', relation: '角色设计标准引用' },
  { first: 'skill-design', second: 'skill-vfx', relation: '技能方案引用' },
]

function VisualInfluenceMap({ modules }: { modules: ArtModule[] }) {
  const moduleById = new Map(modules.map((module) => [module.id, module]))

  const renderTarget = (target: ArtModule) => {
    const TargetIcon = moduleIcons[target.icon]
    return (
      <Link key={target.id} to={`/modules/${target.id}`} className="influence-target">
        <span className="influence-target-icon" style={{ color: target.accent, background: target.tint }}>
          <TargetIcon size={19} strokeWidth={1.7} />
        </span>
        <span>
          <strong>{target.title}</strong>
          <small>{visualInfluenceRules[target.id] || '继承项目主视觉规则'}</small>
        </span>
        <ChevronRight size={15} />
      </Link>
    )
  }

  return (
    <section className="visual-influence-map" aria-labelledby="visual-influence-title">
      <div className="influence-heading">
        <div>
          <span className="eyebrow"><span /> VISUAL INFLUENCE MAP</span>
          <h2 id="visual-influence-title">主视觉影响关系</h2>
          <p>主视觉先锁定项目级规则，再由各模块按自身用途继承和落地；下游可以适配表现，但不能自行改写全局风格。</p>
        </div>
        <span className="influence-legend"><span /> 直接风格约束</span>
      </div>

      <div className="influence-canvas">
        <div className="influence-source">
          <span><Palette size={28} strokeWidth={1.6} /></span>
          <small>唯一视觉事实源</small>
          <strong>主视觉设计</strong>
          <p>色板 · 形状 · 材质<br />光照 · 镜头 · 细节密度</p>
        </div>

        <div className="influence-connector" aria-hidden="true">
          <span>规则传递</span>
          <ArrowRight size={20} />
        </div>

        <div className="influence-target-group">
          <div className="influence-target-group-title">
            <span>下游模块引用关系</span>
            <small>箭头表示引用顺序；独立行表示模块之间无关联</small>
          </div>
          <div className="influence-targets">
            {moduleById.get('game-ui') && (
              <div className="influence-single-row">
                {renderTarget(moduleById.get('game-ui') as ArtModule)}
              </div>
            )}
            {visualInfluenceRows.map((row) => {
              const first = moduleById.get(row.first)
              const second = moduleById.get(row.second)
              if (!first || !second) return null
              return (
                <div key={`${row.first}-${row.second}`} className={`influence-relation-row${row.relation ? '' : ' is-independent'}`}>
                  {renderTarget(first)}
                  <span className="influence-relation" title={row.relation || '彼此独立'} aria-label={row.relation || '彼此独立，无引用关系'}>
                    {row.relation ? <ArrowRight size={17} /> : <small>无关联</small>}
                  </span>
                  {renderTarget(second)}
                </div>
              )
            })}
            {moduleById.get('story-level-design') && (
              <div className="influence-single-row story-parent-row">
                {renderTarget(moduleById.get('story-level-design') as ArtModule)}
              </div>
            )}
            {moduleById.get('background-design') && moduleById.get('map-elements') && (
              <div className="influence-story-children">
                <div className="influence-story-children-title"><MapPinned size={14} /><span>剧情关卡设计下的功能模块</span></div>
                <div className="influence-relation-row">
                  {renderTarget(moduleById.get('background-design') as ArtModule)}
                  <span className="influence-relation" title="背景规范引用" aria-label="背景规范引用"><ArrowRight size={17} /></span>
                  {renderTarget(moduleById.get('map-elements') as ArtModule)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="influence-policy">
        <ShieldCheck size={16} />
        <span><strong>变更规则：</strong>主视觉版本更新时，应重新检查全部八个下游模块；模块例外必须记录原因、范围和批准版本。</span>
      </div>
    </section>
  )
}

const completedModuleCopy: Record<string, { heading: string; item: string; description: string }> = {
  'main-visual-design': { heading: '已完成的主视觉方案', item: '主视觉方案', description: '展示已经批准并作为项目风格事实源的主视觉母版与版本。' },
  'character-design': { heading: '已完成的角色设计', item: '角色设计', description: '展示通过角色设计门禁并已归档的具体角色标准设定。' },
  'character-motion': { heading: '已完成的角色动作', item: '角色动作', description: '展示已经通过帧间一致性和实机验证的正式角色动作。' },
  'skill-design': { heading: '已完成的技能设计', item: '技能设计', description: '展示已经确认范围、阶段、视觉语言和战斗可读性的技能方案。' },
  'skill-vfx': { heading: '已完成的技能动效', item: '技能动效', description: '展示已经完成播放配置、生命周期和实机验证的技能动效。' },
  'background-design': { heading: '已完成的背景设计', item: '背景设计', description: '展示已经通过镜头、分层、角色叠加和分辨率验收的正式背景。' },
  'map-elements': { heading: '已完成的地图元素', item: '地图元素', description: '展示能够正式拼装地图并具备碰撞、遮挡和接地点数据的元素。' },
  'game-ui': { heading: '已完成的游戏 UI 设计', item: '游戏 UI 设计', description: '展示已经完成组件状态、分辨率适配和引擎验证的正式界面。' },
  'story-level-design': { heading: '已完成的剧情关卡', item: '剧情关卡', description: '展示已经完成剧情节拍、空间动线、演出和实机流程验证的关卡。' },
}

type CompletedSequenceAsset = {
  id: string
  projectId: string
  moduleId: string
  name: string
  createdAt: string
  sourceSequenceId: string
  sourceSequenceName: string
  outputDirectory: string
  fps: number
  duration: number
  width: number
  height: number
  frameCount: number
  manifestUrl: string
  frameUrls: string[]
}

function CompletedModuleDesigns({ module, projectId, revision }: { module: ArtModule; projectId: string; revision: number }) {
  const copy = completedModuleCopy[module.id] || { heading: `已完成的${module.title}`, item: module.title, description: `展示已经完成并通过验收的${module.title}。` }
  const Icon = moduleIcons[module.icon]
  const supportsCompletedSequences = module.id === 'character-motion' || module.id === 'skill-vfx'
  const [assets, setAssets] = useState<CompletedSequenceAsset[]>([])
  const [loading, setLoading] = useState(supportsCompletedSequences)
  const [loadError, setLoadError] = useState('')
  const [playingAssetId, setPlayingAssetId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!supportsCompletedSequences) {
      setAssets([])
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    void fetch(`/api/completed-sequences?projectId=${projectId}&moduleId=${module.id}`)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '无法读取已完成素材。')
        setAssets(result)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : '无法读取已完成素材。'))
      .finally(() => setLoading(false))
  }, [module.id, projectId, revision, supportsCompletedSequences])

  useEffect(() => {
    setPlayingAssetId(null)
    setActionError('')
  }, [module.id, projectId])

  const removeCompletedAsset = async (asset: CompletedSequenceAsset) => {
    if (!window.confirm(`确定删除正式素材“${asset.name}”吗？复制到正式素材目录的 PNG 帧和 manifest 将被移除，原始序列帧不会受到影响。`)) return
    setDeletingAssetId(asset.id)
    setActionError('')
    try {
      const response = await fetch(`/api/completed-sequences/${asset.moduleId}/${asset.id}?projectId=${projectId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '删除正式素材失败。')
      setAssets((current) => current.filter((item) => item.id !== asset.id))
      setPlayingAssetId((current) => current === asset.id ? null : current)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除正式素材失败。')
    } finally {
      setDeletingAssetId(null)
    }
  }

  return (
    <section className="completed-designs">
      <div className="completed-heading">
        <div>
          <span className="eyebrow"><span /> COMPLETED PRODUCTION ASSETS</span>
          <h2>{copy.heading}</h2>
          <p>{copy.description} 下方区域不再重复展示设计要求。</p>
        </div>
        <span className="completed-count">{assets.length} 个已完成{copy.item}</span>
      </div>
      {actionError && <div className="sequence-message error"><X size={15} />{actionError}</div>}
      {loading ? (
        <div className="completed-empty"><LoaderCircle className="spin" size={25} /><strong>正在读取正式素材…</strong></div>
      ) : loadError ? (
        <div className="completed-empty"><X size={27} /><strong>正式素材读取失败</strong><p>{loadError}</p></div>
      ) : assets.length > 0 ? (
        <div className="completed-sequence-grid">
          {assets.map((asset) => (
            <CompletedSequenceCard
              key={asset.id}
              asset={asset}
              isPlaying={playingAssetId === asset.id}
              isDeleting={deletingAssetId === asset.id}
              onPlay={() => setPlayingAssetId(asset.id)}
              onPause={() => setPlayingAssetId((current) => current === asset.id ? null : current)}
              onDelete={() => void removeCompletedAsset(asset)}
            />
          ))}
        </div>
      ) : (
        <div className="completed-empty">
          <span><Icon size={31} strokeWidth={1.5} /></span>
          <strong>还没有已完成的{copy.item}</strong>
          <p>{copy.item}完成制作、审核和归档后，将在这里展示预览、名称、版本与验收状态。</p>
          <Link className="button ghost" to={`/modules/${module.id}/requirements`}><BookOpenCheck size={16} /> 查看{module.title}要求</Link>
        </div>
      )}
    </section>
  )
}

function CompletedSequenceCard({
  asset,
  isPlaying,
  isDeleting,
  onPlay,
  onPause,
  onDelete,
}: {
  asset: CompletedSequenceAsset
  isPlaying: boolean
  isDeleting: boolean
  onPlay: () => void
  onPause: () => void
  onDelete: () => void
}) {
  const [currentFrame, setCurrentFrame] = useState(0)
  const frameCount = asset.frameUrls.length

  useEffect(() => setCurrentFrame(0), [asset.id])

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return
    const timer = window.setInterval(() => {
      setCurrentFrame((current) => (current + 1) % frameCount)
    }, 1000 / Math.max(1, asset.fps))
    return () => window.clearInterval(timer)
  }, [asset.fps, frameCount, isPlaying])

  useEffect(() => {
    if (!frameCount) return
    for (let offset = 1; offset <= Math.min(3, frameCount - 1); offset += 1) {
      const image = new window.Image()
      image.src = asset.frameUrls[(currentFrame + offset) % frameCount]
    }
  }, [asset.frameUrls, currentFrame, frameCount])

  const restart = () => {
    setCurrentFrame(0)
    onPlay()
  }

  return (
    <article className="completed-sequence-card">
      <div className="completed-sequence-preview" style={{ aspectRatio: `${asset.width} / ${asset.height}` }}>
        {frameCount > 0 && <img src={asset.frameUrls[currentFrame]} alt={`${asset.name} 播放第 ${currentFrame + 1} 帧`} />}
      </div>
      <div className="sequence-player-controls completed-player-controls">
        <span className={`sequence-playback-status${isPlaying ? ' is-playing' : ''}`} aria-live="polite"><i /> {isPlaying ? '正在播放正式素材' : '播放已暂停'}</span>
        <button className="player-main-control" onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? `暂停${asset.name}` : `播放${asset.name}`}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}{isPlaying ? '暂停' : '播放'}
        </button>
        <button className="player-restart-control" onClick={restart} aria-label={`从头播放${asset.name}`}><RotateCcw size={15} /> 从头播放</button>
        <input
          className="sequence-progress"
          type="range"
          min="0"
          max={Math.max(0, frameCount - 1)}
          value={currentFrame}
          onChange={(event) => setCurrentFrame(Number(event.target.value))}
          aria-label={`${asset.name}播放进度`}
          aria-valuetext={`第 ${currentFrame + 1} 帧，共 ${frameCount} 帧`}
        />
        <span className="sequence-frame-counter"><strong>{currentFrame + 1}</strong> / {frameCount} 帧 · {asset.fps} FPS · 循环</span>
      </div>
      <div className="completed-sequence-info">
        <span className="completed-sequence-status"><ShieldCheck size={13} /> 正式素材</span>
        <small>{new Date(asset.createdAt).toLocaleString('zh-CN')}</small>
        <h3>{asset.name}</h3>
        <p>来源序列：{asset.sourceSequenceName}</p>
        <div><span>{asset.frameCount} 帧</span><span>{asset.fps} FPS</span><span>{asset.width}×{asset.height}</span><span>{asset.duration.toFixed(2)} 秒</span></div>
      </div>
      <footer>
        <code>{asset.outputDirectory}</code>
        <div className="completed-sequence-actions">
          <a href={asset.manifestUrl} target="_blank" rel="noreferrer">正式 manifest <ArrowRight size={13} /></a>
          <button onClick={onDelete} disabled={isDeleting}>{isDeleting ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}{isDeleting ? '正在删除…' : '删除正式素材'}</button>
        </div>
      </footer>
    </article>
  )
}

type FrameSequence = {
  id: string
  moduleId: string
  name: string
  createdAt: string
  sourceOriginalName: string
  outputDirectory: string
  fps: number
  startTime: number
  endTime: number
  duration: number
  width: number
  height: number
  frameCount: number
  manifestUrl: string
  frameUrls: string[]
}

function FrameSequenceStudio({
  projectId,
  moduleId,
  moduleTitle,
  accent,
  tint,
  onPromoted,
}: {
  projectId: string
  moduleId: string
  moduleTitle: string
  accent: string
  tint: string
  onPromoted: () => void
}) {
  const [sequences, setSequences] = useState<FrameSequence[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [fps, setFps] = useState(12)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [playingSequenceId, setPlayingSequenceId] = useState<string | null>(null)
  const [promotingSequence, setPromotingSequence] = useState<FrameSequence | null>(null)
  const [promotionName, setPromotionName] = useState('')
  const [promoting, setPromoting] = useState(false)
  const [promotionError, setPromotionError] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadSequences = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/frame-sequences?projectId=${projectId}&moduleId=${moduleId}`)
      if (!response.ok) throw new Error('无法读取项目中的序列帧记录。')
      setSequences(await response.json())
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '读取失败。' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPlayingSequenceId(null)
    void loadSequences()
  }, [projectId, moduleId])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setMessage({ type: 'error', text: '请先选择一个视频文件。' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('video', file)
      formData.append('projectId', projectId)
      formData.append('moduleId', moduleId)
      formData.append('name', name || file.name.replace(/\.[^.]+$/, ''))
      formData.append('fps', String(fps))
      formData.append('startTime', String(startTime))
      if (endTime.trim()) formData.append('endTime', endTime)

      const response = await fetch('/api/frame-sequences', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '序列帧制作失败。')
      setSequences((current) => [result, ...current])
      setPlayingSequenceId(result.id)
      setFile(null)
      setName('')
      setMessage({ type: 'success', text: `已生成 ${result.frameCount} 帧，并保存到项目目录。` })
      const input = document.getElementById(`sequence-video-${moduleId}`) as HTMLInputElement | null
      if (input) input.value = ''
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '序列帧制作失败。' })
    } finally {
      setSubmitting(false)
    }
  }

  const removeSequence = async (sequence: FrameSequence) => {
    if (!window.confirm(`确定删除“${sequence.name}”吗？原视频、PNG 帧和 manifest 都会从项目中移除。`)) return
    try {
      const response = await fetch(`/api/frame-sequences/${sequence.id}?projectId=${projectId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '删除失败。')
      setSequences((current) => current.filter((item) => item.id !== sequence.id))
      setPlayingSequenceId((current) => current === sequence.id ? null : current)
      setMessage({ type: 'success', text: `已从项目中删除“${sequence.name}”。` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '删除失败。' })
    }
  }

  const openPromotionDialog = (sequence: FrameSequence) => {
    setPromotingSequence(sequence)
    setPromotionName(sequence.name)
    setPromotionError('')
  }

  const closePromotionDialog = () => {
    if (promoting) return
    setPromotingSequence(null)
    setPromotionName('')
    setPromotionError('')
  }

  const promoteSequence = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!promotingSequence || !promotionName.trim()) {
      setPromotionError('请输入正式素材名称。')
      return
    }
    setPromoting(true)
    setPromotionError('')
    try {
      const response = await fetch(`/api/frame-sequences/${promotingSequence.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name: promotionName.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '保存正式素材失败。')
      setMessage({ type: 'success', text: `“${result.name}”已进入当前项目的正式素材。` })
      setPromotingSequence(null)
      setPromotionName('')
      onPromoted()
    } catch (error) {
      setPromotionError(error instanceof Error ? error.message : '保存正式素材失败。')
    } finally {
      setPromoting(false)
    }
  }

  return (
    <section className="sequence-studio" style={{ '--accent': accent } as AccentStyle}>
      <div className="sequence-heading">
        <div>
          <span className="eyebrow"><span /> FRAME SEQUENCE STUDIO</span>
          <h2>视频转序列帧</h2>
          <p>上传动作或动效视频，按时间范围和帧率提取 PNG，并保存到当前项目。</p>
        </div>
        <span className="sequence-badge"><Film size={16} /> {moduleTitle}</span>
      </div>

      <div className="sequence-workspace">
        <div className="sequence-create-column">
          <form className="sequence-form" onSubmit={submit}>
        <label className={`video-drop ${file ? 'has-file' : ''}`} htmlFor={`sequence-video-${moduleId}`}>
          <input
            id={`sequence-video-${moduleId}`}
            type="file"
            accept="video/*,.mkv,.avi"
            onChange={(event) => {
              const selected = event.target.files?.[0] || null
              setFile(selected)
              if (selected && !name) setName(selected.name.replace(/\.[^.]+$/, ''))
            }}
          />
          <span><Upload size={22} /></span>
          <strong>{file ? file.name : '选择或拖入视频文件'}</strong>
          <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'MP4、WebM、MOV、MKV、AVI · 最大 250 MB'}</small>
        </label>

        <div className="sequence-fields">
          <label className="wide"><span>序列名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：主角_向右跑步" /></label>
          <label><span>采样帧率</span><div className="input-suffix"><input type="number" min="1" max="60" value={fps} onChange={(event) => setFps(Number(event.target.value))} /><i>FPS</i></div></label>
          <label><span>开始时间</span><div className="input-suffix"><input type="number" min="0" step="0.01" value={startTime} onChange={(event) => setStartTime(Number(event.target.value))} /><i>秒</i></div></label>
          <label><span>结束时间</span><div className="input-suffix"><input type="number" min="0" step="0.01" value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="视频结尾" /><i>秒</i></div></label>
        </div>

        <div className="sequence-submit">
          <div>
            <strong>项目保存位置</strong>
            <code>project-data/frame-sequences/</code>
          </div>
          <button className="button primary" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle className="spin" size={17} /> : <Film size={17} />}
            {submitting ? '正在提取序列帧…' : '制作并保存序列帧'}
          </button>
        </div>
          </form>

          {message && <div className={`sequence-message ${message.type}`}>{message.type === 'success' ? <Check size={15} /> : <X size={15} />}{message.text}</div>}
        </div>

        <div className="sequence-library">
          <div className="library-title">
            <div><FileVideo2 size={17} /><strong>项目序列帧</strong><span>{sequences.length}</span></div>
            <button onClick={() => void loadSequences()} disabled={loading}><RotateCcw className={loading ? 'spin' : ''} size={14} /> 刷新</button>
          </div>
          {loading ? (
            <div className="sequence-empty"><LoaderCircle className="spin" size={22} /> 正在读取项目记录…</div>
          ) : sequences.length === 0 ? (
            <div className="sequence-empty"><Image size={24} /><strong>还没有序列帧</strong><span>上传第一段视频开始制作。</span></div>
          ) : (
            <div className="sequence-list">
              {sequences.map((sequence) => (
                <SequenceCard
                  key={sequence.id}
                  sequence={sequence}
                  isPlaying={playingSequenceId === sequence.id}
                onPlay={() => setPlayingSequenceId(sequence.id)}
                onPause={() => setPlayingSequenceId((current) => current === sequence.id ? null : current)}
                onPromote={() => openPromotionDialog(sequence)}
                onDelete={() => void removeSequence(sequence)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {promotingSequence && createPortal(
        <div className="promotion-dialog-backdrop" role="presentation" style={{ '--accent': accent, '--tint': tint } as AccentStyle} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePromotionDialog()
        }}>
          <form className="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-dialog-title" onSubmit={promoteSequence}>
            <header>
              <span><PackagePlus size={19} /></span>
              <div><small>FORMAL PROJECT ASSET</small><h3 id="promotion-dialog-title">保存到{moduleId === 'skill-vfx' ? '已完成动效' : '已完成动作'}</h3></div>
              <button type="button" onClick={closePromotionDialog} disabled={promoting} aria-label="关闭命名窗口"><X size={17} /></button>
            </header>
            <div className="promotion-dialog-body">
              <p>将复制当前序列的 PNG 帧并创建独立正式 manifest；以后删除源序列也不会影响该正式素材。</p>
              <label><span>正式素材名称</span><input autoFocus maxLength={60} value={promotionName} onChange={(event) => setPromotionName(event.target.value)} placeholder="例如：主角普通施法" /></label>
              <code>{promotingSequence.frameCount} 帧 · {promotingSequence.fps} FPS · {promotingSequence.width}×{promotingSequence.height}</code>
              {promotionError && <div className="promotion-dialog-error"><X size={14} />{promotionError}</div>}
            </div>
            <footer>
              <button className="button ghost" type="button" onClick={closePromotionDialog} disabled={promoting}>取消</button>
              <button className="button primary" type="submit" disabled={promoting || !promotionName.trim()}>{promoting ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{promoting ? '正在保存正式素材…' : '确认并保存'}</button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </section>
  )
}

function SequenceCard({
  sequence,
  isPlaying,
  onPlay,
  onPause,
  onPromote,
  onDelete,
}: {
  sequence: FrameSequence
  isPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onPromote: () => void
  onDelete: () => void
}) {
  const [currentFrame, setCurrentFrame] = useState(0)
  const frameCount = sequence.frameUrls.length

  useEffect(() => setCurrentFrame(0), [sequence.id])

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return
    const timer = window.setInterval(() => {
      setCurrentFrame((current) => (current + 1) % frameCount)
    }, 1000 / Math.max(1, sequence.fps))
    return () => window.clearInterval(timer)
  }, [frameCount, isPlaying, sequence.fps])

  useEffect(() => {
    if (!frameCount) return
    for (let offset = 1; offset <= Math.min(3, frameCount - 1); offset += 1) {
      const image = new window.Image()
      image.src = sequence.frameUrls[(currentFrame + offset) % frameCount]
    }
  }, [currentFrame, frameCount, sequence.frameUrls])

  const restart = () => {
    setCurrentFrame(0)
    onPlay()
  }

  return (
    <article className="sequence-card">
      <div className="sequence-player">
        <div className="sequence-player-stage" style={{ aspectRatio: `${sequence.width} / ${sequence.height}` }}>
          {frameCount > 0 && (
            <img
              src={sequence.frameUrls[currentFrame]}
              alt={`${sequence.name} 模拟播放第 ${currentFrame + 1} 帧`}
            />
          )}
        </div>
        <div className="sequence-player-controls">
          <span className={`sequence-playback-status${isPlaying ? ' is-playing' : ''}`} aria-live="polite">
            <i /> {isPlaying ? '正在模拟播放' : '模拟播放已暂停'}
          </span>
          <button className="player-main-control" onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? `暂停${sequence.name}` : `播放${sequence.name}`}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button className="player-restart-control" onClick={restart} aria-label={`从头播放${sequence.name}`}><RotateCcw size={15} /> 从头播放</button>
          <input
            className="sequence-progress"
            type="range"
            min="0"
            max={Math.max(0, frameCount - 1)}
            value={currentFrame}
            onChange={(event) => setCurrentFrame(Number(event.target.value))}
            aria-label={`${sequence.name}播放进度`}
            aria-valuetext={`第 ${currentFrame + 1} 帧，共 ${frameCount} 帧`}
          />
          <span className="sequence-frame-counter"><strong>{currentFrame + 1}</strong> / {frameCount} 帧 · {sequence.fps} FPS · 循环</span>
        </div>
      </div>
      <div className="sequence-card-body">
        <div>
          <small>{new Date(sequence.createdAt).toLocaleString('zh-CN')}</small>
          <h3>{sequence.name}</h3>
          <p>{sequence.sourceOriginalName}</p>
        </div>
        <div className="sequence-facts">
          <span><strong>{sequence.frameCount}</strong> 帧</span>
          <span><strong>{sequence.fps}</strong> FPS</span>
          <span><strong>{sequence.width}×{sequence.height}</strong> px</span>
          <span><strong>{sequence.duration.toFixed(2)}</strong> 秒</span>
        </div>
      </div>
      <div className="sequence-path">
        <code>{sequence.outputDirectory}</code>
        <div>
          <button className="promote-sequence-button" onClick={onPromote}><PackagePlus size={13} /> 保存到{sequence.moduleId === 'skill-vfx' ? '已完成动效' : '已完成动作'}</button>
          <a href={sequence.manifestUrl} target="_blank" rel="noreferrer">查看 manifest <ArrowRight size={13} /></a>
          <button onClick={onDelete}><Trash2 size={13} /> 删除</button>
        </div>
      </div>
    </article>
  )
}

function RequirementCard({ section, index, onEdit }: { section: RequirementSection; index: number; onEdit: () => void }) {
  return (
    <article className="requirement-card">
      <div className="requirement-rail"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
      <div className="requirement-body">
        <header>
          <div><small>{section.label}</small><h3>{section.title}</h3><p>{section.description}</p></div>
          <button className="edit-button" onClick={onEdit}><PencilLine size={15} /> 编辑</button>
        </header>
        <ul>
          {section.items.map((item, itemIndex) => (
            <li key={`${section.id}-${itemIndex}`}><span><Check size={13} strokeWidth={2.5} /></span>{item}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}

function SectionEditor({
  section,
  accent,
  recordMode = false,
  onSave,
  onCancel,
  onDelete,
}: {
  section: RequirementSection
  accent: string
  recordMode?: boolean
  onSave: (section: RequirementSection) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(section)
  const [itemsText, setItemsText] = useState(section.items.join('\n'))

  const handleSave = () => {
    const items = itemsText.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!draft.title.trim() || items.length === 0) return
    onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim(), items })
  }

  return (
    <article className="section-editor" style={{ borderColor: accent }}>
      <div className="editor-titlebar">
        <div><span className="editing-pulse" /> 正在编辑{recordMode ? '玩法记录' : '要求'}分组</div>
        <button onClick={onCancel} aria-label="取消编辑"><X size={19} /></button>
      </div>
      <div className="editor-grid">
        <label>
          <span>分组标签</span>
          <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
        </label>
        <label>
          <span>分组标题</span>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label className="full">
          <span>简要说明</span>
          <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label className="full">
          <span>{recordMode ? '记录内容' : '要求条目'} <em>每行一条，可直接新增、修改或删除</em></span>
          <textarea value={itemsText} onChange={(event) => setItemsText(event.target.value)} rows={Math.max(6, draft.items.length + 1)} />
        </label>
      </div>
      <div className="editor-actions">
        <button className="danger-link" onClick={onDelete}><Trash2 size={15} /> 删除分组</button>
        <div>
          <button className="button ghost" onClick={onCancel}>取消</button>
          <button className="button primary" onClick={handleSave}><Save size={16} /> 保存修改</button>
        </div>
      </div>
    </article>
  )
}

export default App
