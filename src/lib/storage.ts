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
  '玩法类型与核心循环': '玩法类型、规模与关键边界',
  '记录游戏类型、玩家行为、反馈与成长如何形成可重复体验。': '记录游戏要做的核心体验、总体内容规模和明确边界，不在此展开具体运行规则。',
  '核心循环：待填写玩家输入、挑战、反馈、奖励与再次行动': '核心玩法闭环：待填写玩家反复执行的核心行为、总体目标、主要反馈与长期驱动力；只描述做什么和为什么，具体时间尺度流程在详细玩法设计维护',
  '核心循环：请按时间尺度填写30秒即时战斗循环、5分钟探索循环、30分钟关卡循环和全程成长循环；明确每个循环的输入、挑战、反馈与奖励': '核心玩法闭环：待填写玩家反复执行的核心行为、总体目标、主要反馈与长期驱动力；只描述做什么和为什么，具体时间尺度流程在详细玩法设计维护',
  '核心特色机制：待填写项目最核心的差异化机制，包括触发条件、运作方式、对其他系统的影响，以及涉及的美术、动画、特效与UI需求': '核心特色机制定位：待填写机制概念、差异化价值、玩家体验目标、适用范围及影响的角色、动作、技能、UI等模块；具体触发、状态、数值与异常规则在详细玩法设计维护',
  '胜负与进度：待填写成功、失败、成长、保存与结算方式': '胜负与成长边界：待填写总体胜负目标、是否包含局内／局外成长、成长深度及明确不做的系统；具体存档、结算、等级、装备、技能和死亡规则在详细玩法设计维护',
  '胜负与进度：待填写成功、失败、保存与结算方式；补充等级满级与属性成长、装备槽与稀有度、技能升级方式及死亡惩罚': '胜负与成长边界：待填写总体胜负目标、是否包含局内／局外成长、成长深度及明确不做的系统；具体存档、结算、等级、装备、技能和死亡规则在详细玩法设计维护',
  '操作与镜头：待填写输入设备、视角、移动和交互方式': '操作与镜头定位：待填写主要输入设备、视角类型、操作复杂度与镜头体验目标；具体按键、跟随、锁定和交互规则在详细玩法设计维护',
  '操作与镜头：待填写输入设备、按键映射概览、视角与移动方式、镜头跟随规则、自动瞄准／锁定方式及UI交互方式': '操作与镜头定位：待填写主要输入设备、视角类型、操作复杂度与镜头体验目标；具体按键、跟随、锁定和交互规则在详细玩法设计维护',
  '双人／多人模式细节：待填写同屏／分屏方式、镜头跟随与玩家分离处理、救援／治疗／物品交换等互动机制，以及暂停、加入、退出与掉线处理': '多人模式定位：待填写目标玩家人数、本地／在线、同屏／分屏及希望形成的协作体验；具体镜头、互动、资源归属、加入退出和异常处理在详细玩法设计维护',
  '特色协作机制：待填写合体等机制的触发、控制分工、持续时间、退出、冷却和失败处理': '特色机制多人接入：待填写“核心特色机制执行规则”在多人状态下的控制分工、同步、持续、退出、冷却和失败处理，不重复定义机制本体',
}

const REQUIRED_GAMEPLAY_FIELDS: Record<string, { fieldName: string; afterField: string }[]> = {
  'gameplay-product-positioning': [{ fieldName: '美术资产范围总览', afterField: '商业与发行方向' }],
  'gameplay-type-loop': [
    { fieldName: '可玩角色概览', afterField: '核心类型' },
    { fieldName: '核心特色机制定位', afterField: '关键系统' },
    { fieldName: '敌人与BOSS概览', afterField: '核心特色机制定位' },
    { fieldName: '场景与关卡概览', afterField: '敌人与BOSS概览' },
  ],
  'gameplay-target-platform': [{ fieldName: '多人模式定位', afterField: '联网方式' }],
}

const REQUIRED_DETAILED_GAMEPLAY_FIELDS: Record<string, { fieldName: string; afterField: string }[]> = {
  'detailed-gameplay-structure': [{ fieldName: '核心特色机制执行规则', afterField: '核心状态机' }],
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
  if (defaultModule.id !== 'gameplay-design' && defaultModule.id !== 'detailed-gameplay-design') return migratedSections

  const requiredFieldsBySection = defaultModule.id === 'gameplay-design'
    ? REQUIRED_GAMEPLAY_FIELDS
    : REQUIRED_DETAILED_GAMEPLAY_FIELDS

  const mergedDefaultSections = defaultModule.sections.map((defaultSection) => {
    const storedSection = migratedSections.find((section) => section.id === defaultSection.id)
    if (!storedSection) return defaultSection
    const requiredFields = requiredFieldsBySection[defaultSection.id] || []
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
    const defaultPrompt = defaultModule.aiPrompt
    const storedPrompt = storedModule?.aiPrompt
    const aiPrompt = defaultPrompt || storedPrompt
      ? {
          prompt: typeof storedPrompt?.prompt === 'string' ? storedPrompt.prompt : defaultPrompt?.prompt || '',
          negativePrompt: typeof storedPrompt?.negativePrompt === 'string' ? storedPrompt.negativePrompt : defaultPrompt?.negativePrompt || '',
          modelAndParameters: typeof storedPrompt?.modelAndParameters === 'string' ? storedPrompt.modelAndParameters : defaultPrompt?.modelAndParameters || '',
          referenceNotes: typeof storedPrompt?.referenceNotes === 'string' ? storedPrompt.referenceNotes : defaultPrompt?.referenceNotes || '',
          updatedAt: typeof storedPrompt?.updatedAt === 'string' ? storedPrompt.updatedAt : defaultPrompt?.updatedAt || '',
        }
      : undefined
    return storedModule
      ? {
          ...defaultModule,
          ...storedModule,
          aiPrompt,
          sections: Array.isArray(storedModule.sections) ? mergeStoredSections(defaultModule, storedModule.sections) : defaultModule.sections,
        }
      : { ...defaultModule, aiPrompt }
  })
}

export function getActiveProjectId() {
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || ''
}

export function setActiveProjectId(projectId: string) {
  window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId)
}
