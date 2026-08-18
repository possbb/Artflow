import type { ArtModule } from '../data/modules'

const LEGACY_MODULES_KEY = 'artflow:module-requirements:v1'
const ACTIVE_PROJECT_KEY = 'artflow:active-project:v1'
const LEGACY_REQUIREMENT_TEXT_REPLACEMENTS: Record<string, string> = {
  '项目级提示词母版': '项目级生成一致性规则',
  '所有模块的AI生成任务继承同一套项目风格上下文。': '主视觉及各模块的美术设计要求共同构成 AI 生成时唯一采用的项目上下文。',
  '建立全项目共享的基础提示词、材质词、光照词、镜头词和质量词': '直接使用主视觉模块中的材质、光照、镜头、构图和质量要求约束全部生成任务',
  '项目专属提示词不得跨项目自动复用，切换项目后重新加载视觉母版': '项目专属生成规则不得跨项目自动复用，切换项目后重新读取当前项目的美术设计要求',
  '提示词固定角色身份、服装、比例、相机、光照和画布': '美术设计要求必须固定角色身份、服装、比例、相机、光照和画布',
  '保留模型、提示词、负面提示词、种子、生成时间和原始输出': '保留所用美术设计要求版本、模型、种子、生成时间和原始输出',
  '保留提示词、参考输入、原始输出、模型、种子、编辑记录与权利状态': '保留所用美术设计要求版本、参考输入、原始输出、模型、种子、编辑记录与权利状态',
  '保留提示词、参考图、模型、种子、生成顺序、修改记录与权利状态': '保留所用美术设计要求版本、参考图、模型、种子、生成顺序、修改记录与权利状态',
  '核心循环：待填写玩家输入、挑战、反馈、奖励与再次行动': '核心循环：请按时间尺度填写30秒即时战斗循环、5分钟探索循环、30分钟关卡循环和全程成长循环；明确每个循环的输入、挑战、反馈与奖励',
  '胜负与进度：待填写成功、失败、成长、保存与结算方式': '胜负与进度：待填写成功、失败、保存与结算方式；补充等级满级与属性成长、装备槽与稀有度、技能升级方式及死亡惩罚',
  '操作与镜头：待填写输入设备、视角、移动和交互方式': '操作与镜头：待填写输入设备、按键映射概览、视角与移动方式、镜头跟随规则、自动瞄准／锁定方式及UI交互方式',
}

const REQUIRED_GAMEPLAY_FIELDS: Record<string, { fieldName: string; afterField: string }[]> = {
  'gameplay-product-positioning': [{ fieldName: '美术资产范围总览', afterField: '商业与发行方向' }],
  'gameplay-type-loop': [
    { fieldName: '可玩角色概览', afterField: '核心类型' },
    { fieldName: '核心特色机制', afterField: '关键系统' },
    { fieldName: '敌人与BOSS概览', afterField: '核心特色机制' },
    { fieldName: '场景与关卡概览', afterField: '敌人与BOSS概览' },
  ],
  'gameplay-target-platform': [{ fieldName: '双人／多人模式细节', afterField: '联网方式' }],
}

function migrateLegacyRequirementText(value: string) {
  return LEGACY_REQUIREMENT_TEXT_REPLACEMENTS[value] || value
}

function mergeStoredSections(defaultModule: ArtModule, storedSections: ArtModule['sections']) {
  const migratedSections = storedSections.map((section) => ({
    ...section,
    title: migrateLegacyRequirementText(section.title),
    description: migrateLegacyRequirementText(section.description),
    items: Array.isArray(section.items) ? section.items.map(migrateLegacyRequirementText) : [],
  }))
  if (defaultModule.id !== 'gameplay-design') return migratedSections

  const mergedDefaultSections = defaultModule.sections.map((defaultSection) => {
    const storedSection = migratedSections.find((section) => section.id === defaultSection.id)
    if (!storedSection) return defaultSection
    const requiredFields = REQUIRED_GAMEPLAY_FIELDS[defaultSection.id] || []
    const items = [...storedSection.items]
    for (const { fieldName, afterField } of requiredFields) {
      if (items.some((item) => item.startsWith(`${fieldName}：`))) continue
      const defaultItem = defaultSection.items.find((item) => item.startsWith(`${fieldName}：`))
      if (!defaultItem) continue
      const afterIndex = items.findIndex((item) => item.startsWith(`${afterField}：`))
      items.splice(afterIndex >= 0 ? afterIndex + 1 : items.length, 0, defaultItem)
    }
    return { ...storedSection, items }
  })
  const customSections = migratedSections.filter((section) => !defaultModule.sections.some((candidate) => candidate.id === section.id))
  return [...mergedDefaultSections, ...customSections]
}

export function loadLegacyModules(fallback: ArtModule[]): ArtModule[] {
  try {
    const stored = window.localStorage.getItem(LEGACY_MODULES_KEY)
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as ArtModule[]
    if (!Array.isArray(parsed)) return fallback
    return mergeModules(fallback, parsed)
  } catch {
    return fallback
  }
}

export function saveLegacyModules(modules: ArtModule[]) {
  window.localStorage.setItem(LEGACY_MODULES_KEY, JSON.stringify(modules))
}

export function mergeModules(fallback: ArtModule[], stored: ArtModule[]): ArtModule[] {
  return fallback.map((defaultModule) => {
    const storedModule = stored.find((module) => module.id === defaultModule.id)
    return storedModule
      ? {
          ...defaultModule,
          sections: Array.isArray(storedModule.sections) ? mergeStoredSections(defaultModule, storedModule.sections) : defaultModule.sections,
        }
      : defaultModule
  })
}

export function getActiveProjectId() {
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || ''
}

export function setActiveProjectId(projectId: string) {
  window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId)
}
