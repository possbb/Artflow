import { useEffect, useMemo, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ChevronRight, CircleAlert, ClipboardList, FileBox, Gamepad2, Layers3, LoaderCircle, MapPinned, PackagePlus, PencilLine, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'

type CityStatus = 'planning' | 'production' | 'review' | 'ready' | 'released'
type ItemStatus = 'planned' | 'in_progress' | 'ready'
type ChestType = 'main' | 'hidden' | 'final'
type PetRarity = 'common' | 'rare'
type WordRole = 'new' | 'review' | 'distractor'
type GamePurpose = 'teach' | 'review' | 'final'
type MusicScope = 'city' | 'area'
type MusicTrigger = 'default' | 'exploration' | 'chest' | 'completion'

type CityArea = { id: string; name: string; theme: string; description: string; order: number; status: ItemStatus }
type CityChest = { id: string; name: string; areaId: string; type: ChestType; culturalNote: string; status: ItemStatus }
type CityVocabulary = { id: string; spanish: string; english: string; chinese: string; category: string; areaId: string; status: ItemStatus }
type GameWordLink = { id: string; gameId: string; wordId: string; role: WordRole; order: number; status: ItemStatus }
type CityPet = { id: string; petContentId: string; chestType: ChestType; weight: number; enabled: boolean; status: ItemStatus }
type PetContentPet = { id: string; spanishName: string; chineseName: string; rarity: 'common' | 'rare'; description: string; assetId: string; status: ItemStatus }
type PetContent = { schemaVersion: number; projectId: string; updatedAt: string; pets: PetContentPet[] }
type CityGame = { id: string; gameContentId: string; chestType: ChestType; order: number; purpose: GamePurpose; questionCount: number; fallbackGameContentId: string; status: ItemStatus }
type CityMusic = { id: string; name: string; resourceRef: string; audioUrl?: string; originalName?: string; scope: MusicScope; areaId: string; trigger: MusicTrigger; loop: boolean; volume: number; fadeSeconds: number; status: ItemStatus }
type GameContentGame = { id: string; name: string; category: string; description: string; ruleReference: string; assetId: string; status: ItemStatus }
type GameContent = { schemaVersion: number; projectId: string; updatedAt: string; games: GameContentGame[] }
type City = {
  id: string
  name: string
  spanishName: string
  status: CityStatus
  difficulty: number
  overview: string
  verticalSlice: string
  plannedCounts: { areas: number; chests: number; vocabulary: number; pets: number; games: number }
  areas: CityArea[]
  chests: CityChest[]
  vocabulary: CityVocabulary[]
  gameWordLinks: GameWordLink[]
  pets: CityPet[]
  games: CityGame[]
  backgroundMusic: CityMusic[]
  updatedAt: string
}
type CityContent = { schemaVersion: number; projectId: string; updatedAt: string; cities: City[] }
type EntityDraft =
  | { kind: 'area'; isNew: boolean; value: CityArea }
  | { kind: 'chest'; isNew: boolean; value: CityChest }
  | { kind: 'vocabulary'; isNew: boolean; value: CityVocabulary }
  | { kind: 'wordLink'; isNew: boolean; value: GameWordLink }
  | { kind: 'pet'; isNew: boolean; value: CityPet }
  | { kind: 'game'; isNew: boolean; value: CityGame }
  | { kind: 'music'; isNew: boolean; value: CityMusic }

const cityStatusCopy: Record<CityStatus, string> = { planning: '规划中', production: '制作中', review: '待验收', ready: '可接入', released: '已发布' }
const itemStatusCopy: Record<ItemStatus, string> = { planned: '待制作', in_progress: '制作中', ready: '已就绪' }
const chestTypeCopy: Record<ChestType, string> = { main: '主线宝箱', hidden: '隐藏宝箱', final: '终点宝箱' }
const petRarityCopy: Record<PetRarity, string> = { common: '普通宠物池', rare: '稀有宠物池' }
const wordRoleCopy: Record<WordRole, string> = { new: '首次教学', review: '复现练习', distractor: '已学干扰项' }
const gamePurposeCopy: Record<GamePurpose, string> = { teach: '教学开锁', review: '复现练习', final: '终点综合题' }
const musicScopeCopy: Record<MusicScope, string> = { city: '全城默认', area: '片区覆盖' }
const musicTriggerCopy: Record<MusicTrigger, string> = { default: '进入城市', exploration: '片区探索', chest: '宝箱互动', completion: '完成片区' }

function emptyContent(projectId: string): CityContent {
  return { schemaVersion: 7, projectId, updatedAt: '', cities: [] }
}

function blankCity(): City {
  return {
    id: `city_${Date.now()}`,
    name: '',
    spanishName: '',
    status: 'planning',
    difficulty: 1,
    overview: '',
    verticalSlice: '',
    plannedCounts: { areas: 0, chests: 0, vocabulary: 0, pets: 0, games: 0 },
    areas: [],
    chests: [],
    vocabulary: [],
    gameWordLinks: [],
    pets: [],
    games: [],
    backgroundMusic: [],
    updatedAt: '',
  }
}

function blankArea(cityId: string): CityArea { return { id: `${cityId}_area_${Date.now()}`, name: '', theme: '', description: '', order: 1, status: 'planned' } }
function blankChest(cityId: string): CityChest { return { id: `${cityId}_chest_${Date.now()}`, name: '', areaId: '', type: 'main', culturalNote: '', status: 'planned' } }
function blankVocabulary(cityId: string): CityVocabulary { return { id: `${cityId}_word_${Date.now()}`, spanish: '', english: '', chinese: '', category: '', areaId: '', status: 'planned' } }
function blankWordLink(cityId: string): GameWordLink { return { id: `${cityId}_game_word_${Date.now()}`, gameId: '', wordId: '', role: 'new', order: 1, status: 'planned' } }
function blankPet(cityId: string): CityPet { return { id: `${cityId}_pet_drop_${Date.now()}`, petContentId: '', chestType: 'main', weight: 0, enabled: true, status: 'planned' } }
function blankMusic(cityId: string): CityMusic { return { id: `${cityId}_bgm_${Date.now()}`, name: '', resourceRef: '', scope: 'city', areaId: '', trigger: 'default', loop: true, volume: 70, fadeSeconds: 1, status: 'planned' } }

function normalizeStaticCityContent(projectId: string, value: CityContent | null): CityContent {
  if (!value || !Array.isArray(value.cities)) return emptyContent(projectId)
  return {
    ...value,
    schemaVersion: 7,
    projectId,
    cities: value.cities.map((city) => {
      const sourceCity = city as any
      const sourceChests = Array.isArray(sourceCity.chests) ? sourceCity.chests : []
      const chests: CityChest[] = sourceChests.map((chest: any) => {
        const type: ChestType = chest.type === 'hidden' || chest.type === 'final' ? chest.type : String(chest.id || '').includes('final') || String(chest.name || '').includes('终点') ? 'final' : 'main'
        return { id: chest.id, name: chest.name, areaId: chest.areaId, type, culturalNote: chest.culturalNote || '', status: chest.status }
      })
      const vocabulary: CityVocabulary[] = (Array.isArray(sourceCity.vocabulary) ? sourceCity.vocabulary : []).map((word: any) => ({ id: word.id, spanish: word.spanish, english: word.english || '', chinese: word.chinese, category: word.category || '', areaId: word.areaId || '', status: word.status }))
      const chestTypeFor = (value: any): ChestType => value === 'hidden' ? 'hidden' : value === 'main' ? 'main' : chests.find((chest) => chest.id === value)?.type || 'main'
      const pets: CityPet[] = (Array.isArray(sourceCity.pets) ? sourceCity.pets : []).map((pet: any, index: number) => ({ id: pet.id || `${city.id}_pet_drop_${index + 1}`, petContentId: pet.petContentId || '', chestType: chestTypeFor(pet.chestType || pet.chestId), weight: Number.isFinite(pet.weight) ? pet.weight : Number(pet.dropRate) || 0, enabled: pet.enabled !== false, status: pet.status || 'planned' }))
      const games: CityGame[] = (Array.isArray(sourceCity.games) ? sourceCity.games : []).map((game: any, index: number) => ({ id: game.id, gameContentId: game.gameContentId || '', chestType: chestTypeFor(game.chestType || game.chestId), order: Number(game.order) || index + 1, purpose: gamePurposeCopy[game.purpose as GamePurpose] ? game.purpose : 'teach', questionCount: Number(game.questionCount) || 4, fallbackGameContentId: game.fallbackGameContentId || '', status: game.status }))
      const legacyLinks = sourceChests.flatMap((chest: any) => (Array.isArray(chest.wordIds) ? chest.wordIds : []).map((wordId: string, index: number) => ({ id: `${chest.id}_${wordId}`, chestId: chest.id, wordId, role: chest.type === 'main' ? 'new' : 'review', order: index + 1, status: 'planned' })))
      const sourceLinks = Array.isArray(sourceCity.gameWordLinks) ? sourceCity.gameWordLinks : Array.isArray(sourceCity.chestWordLinks) ? sourceCity.chestWordLinks : legacyLinks
      const gameWordLinks: GameWordLink[] = sourceLinks.map((link: any, index: number) => ({ id: link.id || `${city.id}_game_word_${index + 1}`, gameId: link.gameId || games.find((game) => game.chestType === chestTypeFor(link.chestType || link.chestId))?.id || '', wordId: link.wordId || '', role: wordRoleCopy[link.role as WordRole] ? link.role : 'review', order: Number(link.order) || index + 1, status: link.status || 'planned' })).filter((link: GameWordLink) => Boolean(link.gameId && link.wordId))
      const backgroundMusic: CityMusic[] = (Array.isArray(sourceCity.backgroundMusic) ? sourceCity.backgroundMusic : []).slice(0, 1).map((music: any, index: number) => ({ id: music.id || `${city.id}_bgm_${index + 1}`, name: music.name || '', resourceRef: music.resourceRef || '', audioUrl: music.audioUrl || '', originalName: music.originalName || '', scope: 'city', areaId: '', trigger: 'default', loop: music.loop !== false, volume: Number.isFinite(music.volume) ? Math.min(100, Math.max(0, music.volume)) : 70, fadeSeconds: Number.isFinite(music.fadeSeconds) ? Math.min(30, Math.max(0, music.fadeSeconds)) : 1, status: music.status || 'planned' }))
      return {
        ...city,
        plannedCounts: { ...city.plannedCounts, games: city.plannedCounts?.games || games.length },
        chests,
        vocabulary,
        gameWordLinks,
        pets,
        games,
        backgroundMusic,
      }
    }),
  }
}
function blankGame(cityId: string): CityGame { return { id: `${cityId}_game_${Date.now()}`, gameContentId: '', chestType: 'main', order: 1, purpose: 'teach', questionCount: 4, fallbackGameContentId: '', status: 'planned' } }

export function CityContentPage({ projectId, staticDemo }: { projectId: string; staticDemo: boolean }) {
  const [content, setContent] = useState<CityContent | null>(null)
  const [petContent, setPetContent] = useState<PetContent | null>(null)
  const [gameContent, setGameContent] = useState<GameContent | null>(null)
  const [selectedCityId, setSelectedCityId] = useState('')
  const [cityDraft, setCityDraft] = useState<{ isNew: boolean; value: City } | null>(null)
  const [entityDraft, setEntityDraft] = useState<EntityDraft | null>(null)
  const [petPoolChestType, setPetPoolChestType] = useState<ChestType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!cityDraft && !entityDraft && !petPoolChestType) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [cityDraft, entityDraft])

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setSelectedCityId('')
    setCityDraft(null)
    setEntityDraft(null)
    setPetPoolChestType(null)
    setMessage(null)
    void (async () => {
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:city-content:${projectId}:v1`)
          setContent(normalizeStaticCityContent(projectId, stored ? JSON.parse(stored) : null))
          const storedPets = window.localStorage.getItem(`artflow:pet-content:${projectId}:v1`)
          setPetContent(storedPets ? JSON.parse(storedPets) : { schemaVersion: 1, projectId, updatedAt: '', pets: [] })
          const storedGames = window.localStorage.getItem(`artflow:game-content:${projectId}:v1`)
          setGameContent(storedGames ? JSON.parse(storedGames) : { schemaVersion: 1, projectId, updatedAt: '', games: [] })
        } else {
          const [cityResponse, petResponse, gameResponse] = await Promise.all([fetch(`/api/projects/${projectId}/city-content`), fetch(`/api/projects/${projectId}/pet-content`), fetch(`/api/projects/${projectId}/game-content`)])
          const [cityResult, petResult, gameResult] = await Promise.all([cityResponse.json(), petResponse.json(), gameResponse.json()])
          if (!cityResponse.ok) throw new Error(cityResult.error || '城市内容读取失败。')
          if (!petResponse.ok) throw new Error(petResult.error || '宠物内容读取失败。')
          if (!gameResponse.ok) throw new Error(gameResult.error || '游戏内容读取失败。')
          setContent(cityResult)
          setPetContent(petResult)
          setGameContent(gameResult)
        }
      } catch (loadError) {
        setContent(null)
        setMessage({ type: 'error', text: loadError instanceof Error ? loadError.message : '城市内容读取失败。' })
      } finally {
        setLoading(false)
      }
    })()
  }, [projectId, staticDemo])

  const persistContent = async (nextContent: CityContent, success: string) => {
    setSaving(true)
    setMessage(null)
    try {
      const value = { ...nextContent, updatedAt: new Date().toISOString() }
      if (staticDemo) {
        window.localStorage.setItem(`artflow:city-content:${projectId}:v1`, JSON.stringify(value))
        setContent(value)
      } else {
        const response = await fetch(`/api/projects/${projectId}/city-content`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: value }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '城市内容保存失败。')
        setContent(result.content)
      }
      setCityDraft(null)
      setEntityDraft(null)
      setPetPoolChestType(null)
      setMessage({ type: 'success', text: success })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError instanceof Error ? saveError.message : '城市内容保存失败。' })
    } finally {
      setSaving(false)
    }
  }

  const selectedCity = useMemo(() => content?.cities.find((city) => city.id === selectedCityId) || content?.cities[0] || null, [content, selectedCityId])
  const selectCity = (cityId: string) => { setSelectedCityId(cityId); setCityDraft(null); setEntityDraft(null); setPetPoolChestType(null) }

  const saveCity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content || !cityDraft) return
    const city = { ...cityDraft.value, id: cityDraft.value.id.trim(), name: cityDraft.value.name.trim(), spanishName: cityDraft.value.spanishName.trim() }
    if (!city.id || !city.name) return setMessage({ type: 'error', text: '请填写城市 ID 和城市名称。' })
    const cities = cityDraft.isNew ? [...content.cities, city] : content.cities.map((item) => item.id === city.id ? city : item)
    setSelectedCityId(city.id)
    void persistContent({ ...content, cities }, cityDraft.isNew ? `已新增城市“${city.name}”。` : `已更新城市“${city.name}”。`)
  }

  const removeCity = (city: City) => {
    if (!content || !window.confirm(`确定删除城市“${city.name}”及其全部内容吗？`)) return
    setSelectedCityId('')
    void persistContent({ ...content, cities: content.cities.filter((item) => item.id !== city.id) }, `已删除城市“${city.name}”。`)
  }

  const updateCity = (nextCity: City, success: string) => {
    if (!content) return
    void persistContent({ ...content, cities: content.cities.map((city) => city.id === nextCity.id ? nextCity : city) }, success)
  }

  const saveVocabularyTable = (vocabulary: CityVocabulary[]) => {
    if (!selectedCity) return
    const normalized = vocabulary.map((word) => ({ ...word, id: word.id.trim(), spanish: word.spanish.trim(), english: word.english.trim(), chinese: word.chinese.trim(), category: word.category.trim() }))
    if (normalized.some((word) => !word.id || !word.spanish || !word.english || !word.chinese)) return setMessage({ type: 'error', text: '每个词汇都必须填写西语、英文和中文，且保留稳定 ID。' })
    if (new Set(normalized.map((word) => word.id)).size !== normalized.length) return setMessage({ type: 'error', text: '核心词汇表中存在重复的稳定 ID。' })
    if (new Set(normalized.map((word) => word.spanish.toLocaleLowerCase())).size !== normalized.length) return setMessage({ type: 'error', text: '同一座城市不能重复录入相同的西语词汇。' })
    const wordIds = new Set(normalized.map((word) => word.id))
    updateCity({ ...selectedCity, vocabulary: normalized, gameWordLinks: selectedCity.gameWordLinks.filter((link) => wordIds.has(link.wordId)) }, `已保存核心词汇表，共 ${normalized.length} 条。`)
  }

  const savePetPool = (chestType: ChestType, pets: CityPet[]) => {
    if (!selectedCity) return
    if (!selectedCity.chests.some((chest) => chest.type === chestType)) return setMessage({ type: 'error', text: '该城市尚未创建此宝箱类型，请先录入对应类型的宝箱。' })
    if (!pets.length) return setMessage({ type: 'error', text: '请至少配置一只宠物。' })
    const normalized = pets.map((pet, index) => ({ ...pet, id: pet.id.trim() || `${selectedCity.id}_pet_drop_${Date.now()}_${index + 1}`, chestType, weight: Math.round(Number(pet.weight) * 100) / 100 }))
    if (normalized.some((pet) => !pet.petContentId)) return setMessage({ type: 'error', text: '请为每一行选择宠物内容。' })
    if (normalized.some((pet) => !Number.isFinite(pet.weight) || pet.weight < 0 || pet.weight > 100)) return setMessage({ type: 'error', text: '每只宠物的掉落概率必须在 0% 到 100% 之间。' })
    if (new Set(normalized.map((pet) => pet.petContentId)).size !== normalized.length) return setMessage({ type: 'error', text: '同一宝箱类型不能重复配置同一只宠物。' })
    const total = Math.round(normalized.filter((pet) => pet.enabled).reduce((sum, pet) => sum + pet.weight, 0) * 100) / 100
    if (total !== 100) return setMessage({ type: 'error', text: `启用宠物的掉落概率合计为 ${total}%，必须恰好为 100%。` })
    updateCity({ ...selectedCity, pets: [...selectedCity.pets.filter((pet) => pet.chestType !== chestType), ...normalized] }, `已保存${chestTypeCopy[chestType]}宠物池，共 ${normalized.length} 只宠物。`)
  }

  const saveEntity = (event: FormEvent<HTMLFormElement>, draftOverride?: EntityDraft) => {
    event.preventDefault()
    const activeDraft = draftOverride || entityDraft
    if (!selectedCity || !activeDraft) return
    const updateList = <T extends { id: string },>(items: T[], value: T) => activeDraft.isNew ? [...items, value] : items.map((item) => item.id === value.id ? value : item)
    if (activeDraft.kind === 'area') {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.name.trim()) return setMessage({ type: 'error', text: '请填写片区名称。' })
      updateCity({ ...selectedCity, areas: updateList(selectedCity.areas, { ...current, id: current.id.trim(), name: current.name.trim() }) }, `已保存片区“${current.name.trim()}”。`)
    } else if (activeDraft.kind === 'chest') {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.name.trim() || !current.areaId) return setMessage({ type: 'error', text: '请填写宝箱名称并关联片区。' })
      updateCity({ ...selectedCity, chests: updateList(selectedCity.chests, { ...current, id: current.id.trim(), name: current.name.trim() }) }, `已保存宝箱“${current.name.trim()}”。`)
    } else if (activeDraft.kind === 'vocabulary') {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.spanish.trim() || !current.english.trim() || !current.chinese.trim()) return setMessage({ type: 'error', text: '请填写西语、英文和中文释义。' })
      updateCity({ ...selectedCity, vocabulary: updateList(selectedCity.vocabulary, { ...current, id: current.id.trim(), spanish: current.spanish.trim(), english: current.english.trim(), chinese: current.chinese.trim() }) }, `已保存词汇“${current.spanish.trim()}”。`)
    } else if (activeDraft.kind === 'wordLink') {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.gameId || !current.wordId) return setMessage({ type: 'error', text: '请选择要关联的游戏和核心词汇。' })
      if (selectedCity.gameWordLinks.some((link) => link.id !== current.id && link.gameId === current.gameId && link.wordId === current.wordId)) return setMessage({ type: 'error', text: '同一个游戏不能重复关联同一核心词汇。' })
      const linkedGame = selectedCity.games.find((game) => game.id === current.gameId)
      if (current.role === 'new' && linkedGame?.chestType !== 'main') return setMessage({ type: 'error', text: '只有主线宝箱类型的游戏配置可以引入新词。' })
      updateCity({ ...selectedCity, gameWordLinks: updateList(selectedCity.gameWordLinks, { ...current, id: current.id.trim() }) }, '已保存游戏—词汇引用。')
    } else if (activeDraft.kind === 'pet') {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.petContentId || !current.chestType) return setMessage({ type: 'error', text: '请选择宠物内容管理中的宠物和适用宝箱类型。' })
      if (!selectedCity.chests.some((chest) => chest.type === current.chestType)) return setMessage({ type: 'error', text: '该城市尚未创建此宝箱类型，请先录入对应类型的宝箱。' })
      if (!Number.isFinite(current.weight) || current.weight < 0 || current.weight > 100) return setMessage({ type: 'error', text: '宠物池权重必须在 0% 到 100% 之间。' })
      if (selectedCity.pets.some((pet) => pet.id !== current.id && pet.petContentId === current.petContentId && pet.chestType === current.chestType)) return setMessage({ type: 'error', text: '同一宝箱类型不能重复配置同一只宠物，请直接修改现有概率。' })
      updateCity({ ...selectedCity, pets: updateList(selectedCity.pets, { ...current, id: current.id.trim(), weight: Math.round(current.weight * 100) / 100 }) }, '已保存宝箱—宠物引用。')
    } else if (activeDraft.kind === 'music') {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.name.trim() || !current.resourceRef.trim()) return setMessage({ type: 'error', text: '请填写音轨名称和音频资源路径或 ID。' })
      if (current.scope === 'area' && !current.areaId) return setMessage({ type: 'error', text: '片区覆盖音乐必须选择适用片区。' })
      updateCity({ ...selectedCity, backgroundMusic: [{ ...current, id: current.id.trim(), name: current.name.trim(), resourceRef: current.resourceRef.trim(), scope: 'city', areaId: '', trigger: 'default', volume: Math.round(Math.min(100, Math.max(0, current.volume))), fadeSeconds: Math.round(Math.min(30, Math.max(0, current.fadeSeconds)) * 10) / 10 }] }, `已保存背景音乐“${current.name.trim()}”。`)
    } else {
      const current = activeDraft.value
      if (!current.id.trim()) return setMessage({ type: 'error', text: '每个内容条目都必须填写稳定 ID。' })
      if (!current.gameContentId || !current.chestType) return setMessage({ type: 'error', text: '请选择游戏管理中的游戏和适用宝箱类型。' })
      if (!selectedCity.chests.some((chest) => chest.type === current.chestType)) return setMessage({ type: 'error', text: '该城市尚未创建此宝箱类型，请先录入对应类型的宝箱。' })
      updateCity({ ...selectedCity, games: updateList(selectedCity.games, { ...current, id: current.id.trim() }) }, '已保存城市游戏引用。')
    }
  }

  const removeEntity = async (kind: EntityDraft['kind'], id: string, name: string) => {
    if (!selectedCity || !window.confirm(`确定删除“${name}”吗？`)) return
    if (kind === 'area' && selectedCity.chests.some((chest) => chest.areaId === id)) return setMessage({ type: 'error', text: '该片区仍有宝箱引用，请先移动或删除这些宝箱。' })
    if (kind === 'music' && !staticDemo) {
      try {
        const response = await fetch(`/api/projects/${projectId}/cities/${selectedCity.id}/background-music/${id}`, { method: 'DELETE' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '背景音乐文件删除失败。')
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : '背景音乐文件删除失败。' })
        return
      }
    }
    const removedGameIds = kind === 'game' ? [id] : []
    const nextCity = kind === 'area' ? { ...selectedCity, areas: selectedCity.areas.filter((item) => item.id !== id) }
      : kind === 'chest' ? { ...selectedCity, chests: selectedCity.chests.filter((item) => item.id !== id) }
        : kind === 'vocabulary' ? { ...selectedCity, vocabulary: selectedCity.vocabulary.filter((item) => item.id !== id), gameWordLinks: selectedCity.gameWordLinks.filter((link) => link.wordId !== id) }
          : kind === 'wordLink' ? { ...selectedCity, gameWordLinks: selectedCity.gameWordLinks.filter((item) => item.id !== id) }
            : kind === 'pet' ? { ...selectedCity, pets: selectedCity.pets.filter((item) => item.id !== id) }
              : kind === 'music' ? { ...selectedCity, backgroundMusic: selectedCity.backgroundMusic.filter((item) => item.id !== id) }
                : { ...selectedCity, games: selectedCity.games.filter((item) => item.id !== id), gameWordLinks: selectedCity.gameWordLinks.filter((link) => link.gameId !== id) }
    updateCity(nextCity, `已删除“${name}”。`)
  }

  if (loading) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取城市内容…</div>
  if (!content) return <div className="registry-empty is-error"><X size={23} /> {message?.text || '城市内容不可用。'}</div>

  return (
    <div className="city-content-page page-enter">
      <section className="city-content-hero">
        <div>
          <span className="section-kicker"><MapPinned size={14} /> CITY CONTENT CATALOG</span>
          <h1>城市内容管理</h1>
          <p>按城市维护实际的片区、宝箱、核心词汇和宠物内容。解锁、题型、词汇复现、存档、下载与异常处理规则统一引用详细玩法设计。</p>
        </div>
        <div><Link className="button ghost" to="/modules/detailed-gameplay-design"><ClipboardList size={16} /> 查看详细玩法规则</Link><Link className="button ghost" to="/pet-content-management">宠物内容管理</Link><button className="button primary" onClick={() => setCityDraft({ isNew: true, value: blankCity() })}><Plus size={17} /> 新增城市</button></div>
      </section>
      <CityContentInfluenceMap />

      {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}

      {cityDraft && createPortal(<div className="city-entity-modal-backdrop"><div className="city-entity-modal" role="dialog" aria-modal="true" aria-label={cityDraft.isNew ? '新增城市内容档案' : '编辑城市内容档案'}><CityEditor draft={cityDraft} saving={saving} onChange={(value) => setCityDraft({ ...cityDraft, value })} onCancel={() => setCityDraft(null)} onSave={saveCity} /></div></div>, document.body)}

      <section className="city-catalog-section">
        <header><div><span className="eyebrow"><span /> PROJECT CITY CONTENT</span><h2>城市目录</h2></div><strong>{content.cities.length} 座城市</strong></header>
        {content.cities.length === 0 ? <div className="city-empty"><MapPinned size={31} /><strong>还没有城市内容</strong><p>新增城市后即可录入片区、宝箱、词汇、宠物与游戏模块。</p><button className="button primary" onClick={() => setCityDraft({ isNew: true, value: blankCity() })}><Plus size={16} /> 新增第一座城市</button></div> : <div className="city-card-grid">{content.cities.map((city) => <button className={`city-card ${selectedCity?.id === city.id ? 'selected' : ''}`} key={city.id} onClick={() => selectCity(city.id)}><span className={`city-status ${city.status}`}>{cityStatusCopy[city.status]}</span><h3>{city.name}</h3><p>{city.spanishName || city.id}</p><div><span>{city.areas.length}/{city.plannedCounts.areas} 片区</span><span>{city.chests.length}/{city.plannedCounts.chests} 宝箱</span><span>{city.vocabulary.length}/{city.plannedCounts.vocabulary} 词汇</span><span>{city.pets.length}/{city.plannedCounts.pets} 宠物投放</span><span>{city.games.length}/{city.plannedCounts.games} 游戏</span></div><ChevronRight size={17} /></button>)}</div>}
      </section>

      {selectedCity && <CityContentDetail projectId={projectId} staticDemo={staticDemo} city={selectedCity} petContent={petContent?.pets || []} gameContent={gameContent?.games || []} saving={saving} onEditCity={() => setCityDraft({ isNew: false, value: { ...selectedCity, plannedCounts: { ...selectedCity.plannedCounts } } })} onDeleteCity={() => removeCity(selectedCity)} entityDraft={entityDraft} onEditEntity={setEntityDraft} onCloseEntity={() => setEntityDraft(null)} onSaveEntity={saveEntity} onRemoveEntity={removeEntity} onSaveVocabulary={saveVocabularyTable} petPoolChestType={petPoolChestType} onEditPetPool={(chestType) => { setEntityDraft(null); setPetPoolChestType(chestType) }} onClosePetPool={() => setPetPoolChestType(null)} onSavePetPool={savePetPool} />}
    </div>
  )
}

function CityEditor({ draft, saving, onChange, onCancel, onSave }: { draft: { isNew: boolean; value: City }; saving: boolean; onChange: (value: City) => void; onCancel: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const city = draft.value
  const set = <K extends keyof City>(key: K, value: City[K]) => onChange({ ...city, [key]: value })
  const setCount = (key: keyof City['plannedCounts'], value: number) => onChange({ ...city, plannedCounts: { ...city.plannedCounts, [key]: Math.max(0, value) } })
  return <form className="city-editor" onSubmit={onSave}>
    <header><div><span>{draft.isNew ? 'NEW CITY' : 'EDIT CITY'}</span><h2>{draft.isNew ? '新增城市内容档案' : `编辑 ${city.name}`}</h2></div><button type="button" onClick={onCancel}><X size={18} /></button></header>
    <div className="city-editor-grid">
      <label><span>城市 ID *</span><input value={city.id} disabled={!draft.isNew} onChange={(event) => set('id', event.target.value)} placeholder="city_barcelona" /></label>
      <label><span>城市名称 *</span><input value={city.name} onChange={(event) => set('name', event.target.value)} placeholder="巴塞罗那" /></label>
      <label><span>西语／英文名称</span><input value={city.spanishName} onChange={(event) => set('spanishName', event.target.value)} placeholder="Barcelona" /></label>
      <label><span>内容状态</span><select value={city.status} onChange={(event) => set('status', event.target.value as CityStatus)}>{Object.entries(cityStatusCopy).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>难度等级</span><input type="number" min="1" max="5" value={city.difficulty} onChange={(event) => set('difficulty', Number(event.target.value) || 1)} /></label>
      <label><span>计划片区数</span><input type="number" min="0" value={city.plannedCounts.areas} onChange={(event) => setCount('areas', Number(event.target.value) || 0)} /></label>
      <label><span>计划宝箱数</span><input type="number" min="0" value={city.plannedCounts.chests} onChange={(event) => setCount('chests', Number(event.target.value) || 0)} /></label>
      <label><span>计划核心词汇数</span><input type="number" min="0" value={city.plannedCounts.vocabulary} onChange={(event) => setCount('vocabulary', Number(event.target.value) || 0)} /></label>
      <label><span>计划宠物数</span><input type="number" min="0" value={city.plannedCounts.pets} onChange={(event) => setCount('pets', Number(event.target.value) || 0)} /></label>
      <label><span>计划游戏模块数</span><input type="number" min="0" value={city.plannedCounts.games} onChange={(event) => setCount('games', Number(event.target.value) || 0)} /></label>
      <label className="full"><span>城市内容概览</span><textarea value={city.overview} onChange={(event) => set('overview', event.target.value)} rows={3} placeholder="说明城市主题、内容定位和当前范围；实际片区与名单在下方实体清单维护。" /></label>
      <label className="full"><span>城市纵向切片说明</span><textarea value={city.verticalSlice} onChange={(event) => set('verticalSlice', event.target.value)} rows={3} placeholder="仅记录这座城市的切片范围与验收安排。通用切片规则请在详细玩法设计维护。" /></label>
    </div>
    <footer><button className="button ghost" type="button" onClick={onCancel}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存城市档案</button></footer>
  </form>
}

function CityContentDetail({ projectId, staticDemo, city, petContent, gameContent, saving, onEditCity, onDeleteCity, entityDraft, onEditEntity, onCloseEntity, onSaveEntity, onRemoveEntity, onSaveVocabulary, petPoolChestType, onEditPetPool, onClosePetPool, onSavePetPool }: { projectId: string; staticDemo: boolean; city: City; petContent: PetContentPet[]; gameContent: GameContentGame[]; saving: boolean; onEditCity: () => void; onDeleteCity: () => void; entityDraft: EntityDraft | null; onEditEntity: (value: EntityDraft) => void; onCloseEntity: () => void; onSaveEntity: (event: FormEvent<HTMLFormElement>, draftOverride?: EntityDraft) => void; onRemoveEntity: (kind: EntityDraft['kind'], id: string, name: string) => void; onSaveVocabulary: (value: CityVocabulary[]) => void; petPoolChestType: ChestType | null; onEditPetPool: (chestType: ChestType) => void; onClosePetPool: () => void; onSavePetPool: (chestType: ChestType, pets: CityPet[]) => void }) {
  const areaName = (areaId: string) => city.areas.find((area) => area.id === areaId)?.name || '未关联片区'
  const chestTypeName = (chestType: ChestType) => chestTypeCopy[chestType]
  const wordName = (wordId: string) => city.vocabulary.find((word) => word.id === wordId)?.spanish || wordId
  const gameName = (gameId: string) => gameContent.find((game) => game.id === city.games.find((item) => item.id === gameId)?.gameContentId)?.name || '未关联游戏'
  const petDefinition = (petContentId: string) => petContent.find((pet) => pet.id === petContentId)
  const gameDefinition = (gameContentId: string) => gameContent.find((game) => game.id === gameContentId)
  const petDropTotal = (chestType: ChestType) => Math.round(city.pets.filter((pet) => pet.enabled && pet.chestType === chestType).reduce((total, pet) => total + pet.weight, 0) * 100) / 100
  const availableChestTypes = [...new Set(city.chests.map((chest) => chest.type))] as ChestType[]
  const defaultChestType = availableChestTypes[0] || 'main'
  const entityEditor = entityDraft ? createPortal(<div className="city-entity-modal-backdrop"><div className="city-entity-modal" role="dialog" aria-modal="true" aria-label="编辑城市内容"><EntityEditor projectId={projectId} staticDemo={staticDemo} city={city} petContent={petContent} gameContent={gameContent} draft={entityDraft} saving={saving} onChange={onEditEntity} onCancel={onCloseEntity} onSave={onSaveEntity} /></div></div>, document.body) : null
  const petPoolEditor = petPoolChestType ? createPortal(<div className="city-entity-modal-backdrop"><div className="city-entity-modal" role="dialog" aria-modal="true" aria-label="配置宝箱宠物池"><PetPoolEditor key={petPoolChestType} city={city} chestType={petPoolChestType} availableChestTypes={availableChestTypes} petContent={petContent} saving={saving} onChangeChestType={onEditPetPool} onCancel={onClosePetPool} onSave={onSavePetPool} /></div></div>, document.body) : null
  return <section className="city-detail">
    <header className="city-detail-header"><div><span className={`city-status ${city.status}`}>{cityStatusCopy[city.status]}</span><h2>{city.name}<small>{city.spanishName || city.id}</small></h2><p>{city.overview || '尚未填写城市内容概览。'}</p></div><div><button className="button ghost" onClick={onEditCity}><PencilLine size={16} /> 编辑城市</button><button className="button danger" onClick={onDeleteCity} disabled={saving}><Trash2 size={16} /> 删除城市</button></div></header>
    {city.verticalSlice && <div className="city-slice-note"><FileBox size={18} /><div><strong>该城市的纵向切片说明</strong><p>{city.verticalSlice}</p></div></div>}
    <div className="city-content-summary"><SummaryCard icon={<Layers3 size={18} />} label="片区" value={city.areas.length} planned={city.plannedCounts.areas} /><SummaryCard icon={<PackagePlus size={18} />} label="宝箱" value={city.chests.length} planned={city.plannedCounts.chests} /><SummaryCard icon={<ClipboardList size={18} />} label="核心词汇" value={city.vocabulary.length} planned={city.plannedCounts.vocabulary} /><SummaryCard icon={<MapPinned size={18} />} label="宠物投放" value={city.pets.length} planned={city.plannedCounts.pets} /><SummaryCard icon={<Gamepad2 size={18} />} label="游戏投放" value={city.games.length} planned={city.plannedCounts.games} /></div>

    <ContentPanel title="片区" description="记录实际片区、主题和制作状态；有宝箱引用的片区不能直接删除。" onAdd={() => onEditEntity({ kind: 'area', isNew: true, value: blankArea(city.id) })}>
      {city.areas.length === 0 ? <EmptyContent text="尚未录入片区。" /> : <div className="city-entity-grid">{[...city.areas].sort((first, second) => first.order - second.order).map((area) => <article className="city-entity-card" key={area.id}><EntityCardActions onEdit={() => onEditEntity({ kind: 'area', isNew: false, value: { ...area } })} onRemove={() => onRemoveEntity('area', area.id, area.name)} disabled={saving} /><span>{String(area.order).padStart(2, '0')} / {itemStatusCopy[area.status]}</span><h4>{area.name}</h4><p>{area.theme || '未填写主题'}</p>{area.description && <small>{area.description}</small>}<code>{area.id}</code></article>)}</div>}
    </ContentPanel>

    <ContentPanel title="宝箱" description="宝箱只维护位置和分类；宠物、游戏通过下方的“宝箱类型配置”统一应用到同类型宝箱，核心词汇由游戏进一步关联。" onAdd={() => onEditEntity({ kind: 'chest', isNew: true, value: blankChest(city.id) })}>
      {city.chests.length === 0 ? <EmptyContent text="尚未录入宝箱。" /> : <div className="city-entity-grid">{city.chests.map((chest) => { const petCount = city.pets.filter((pet) => pet.chestType === chest.type).length; const gameCount = city.games.filter((game) => game.chestType === chest.type).length; return <article className={`city-entity-card chest-${chest.type}`} key={chest.id}><EntityCardActions onEdit={() => onEditEntity({ kind: 'chest', isNew: false, value: { ...chest } })} onRemove={() => onRemoveEntity('chest', chest.id, chest.name)} disabled={saving} /><span>{chestTypeCopy[chest.type]} · {itemStatusCopy[chest.status]}</span><h4>{chest.name}</h4><p>{areaName(chest.areaId)}</p><small>本类型统一配置：{petCount} 个宠物 · {gameCount} 个游戏</small>{chest.culturalNote && <small>{chest.culturalNote}</small>}<code>{chest.id}</code></article> })}</div>}
    </ContentPanel>

    <ContentPanel title="核心词汇表" description="集中维护每个词汇的西语、英文、中文与投放归属；支持从 Excel 或任意表格直接批量粘贴。">
      <VocabularyTable city={city} saving={saving} onSave={onSaveVocabulary} />
    </ContentPanel>

    <ContentPanel title="游戏—词汇投放" description="这是游戏与核心词汇关系的唯一事实源；宝箱只关联游戏，游戏负责向玩家呈现首次教学、复现或干扰词。" onAdd={() => onEditEntity({ kind: 'wordLink', isNew: true, value: blankWordLink(city.id) })}>
      {city.gameWordLinks.length === 0 ? <EmptyContent text="尚未配置游戏—词汇投放。" /> : <div className="city-entity-grid">{[...city.gameWordLinks].sort((first, second) => first.order - second.order).map((link) => <article className="city-entity-card" key={link.id}><EntityCardActions onEdit={() => onEditEntity({ kind: 'wordLink', isNew: false, value: { ...link } })} onRemove={() => onRemoveEntity('wordLink', link.id, `${gameName(link.gameId)} → ${wordName(link.wordId)}`)} disabled={saving} /><span>{wordRoleCopy[link.role]} · 顺序 {link.order}</span><h4>{wordName(link.wordId)}</h4><p>{gameName(link.gameId)}</p><code>{link.gameId} → {link.wordId}</code></article>)}</div>}
    </ContentPanel>

    <ContentPanel title="宝箱类型—宠物投放" description="按当前城市实际出现的宝箱类型分别维护唯一宠物池；在同一配置窗口中可添加多只宠物并校验启用概率合计为 100%。" onAdd={availableChestTypes.length ? () => onEditPetPool(defaultChestType) : undefined} addLabel="选择宝箱类型配置">
      {availableChestTypes.length === 0 ? <EmptyContent text="请先创建至少一个宝箱，再配置该城市的类型宠物池。" /> : <div className="city-entity-grid">{availableChestTypes.map((chestType) => { const pets = city.pets.filter((pet) => pet.chestType === chestType); const total = petDropTotal(chestType); return <article className="city-entity-card city-pet-pool-card" key={chestType}><span>{chestTypeName(chestType)} · {total === 100 ? '概率已配平' : `当前 ${total}%`}</span><h4>{chestTypeName(chestType)}宠物池<small>{pets.length ? `已配置 ${pets.length} 只宠物` : '尚未配置宠物'}</small></h4><p>{pets.length ? pets.map((pet) => petDefinition(pet.petContentId)?.chineseName || pet.petContentId).join('、') : '点击下方按钮添加宠物与掉落概率。'}</p><small>{total === 100 ? '启用宠物的掉落概率合计为 100%，可正常投放。' : `启用宠物的掉落概率合计为 ${total}%，保存时必须调整为 100%。`}</small><button className="button ghost city-pet-pool-config" onClick={() => onEditPetPool(chestType)} disabled={saving}><PencilLine size={14} /> 配置宠物池</button></article> })}</div>}
    </ContentPanel>

    <ContentPanel title="宝箱类型—游戏投放" description="仅可选择当前城市实际已出现的宝箱类型，并记录引用游戏的执行顺序、用途、题量和不可用时的降级游戏。" onAdd={() => onEditEntity({ kind: 'game', isNew: true, value: { ...blankGame(city.id), chestType: defaultChestType } })}>
      {city.games.length === 0 ? <EmptyContent text="尚未配置宝箱类型语言小游戏。" /> : <div className="city-entity-grid">{city.games.map((game) => { const definition = gameDefinition(game.gameContentId); const wordCount = city.gameWordLinks.filter((link) => link.gameId === game.id).length; return <article className="city-entity-card" key={game.id}><EntityCardActions onEdit={() => onEditEntity({ kind: 'game', isNew: false, value: { ...game } })} onRemove={() => onRemoveEntity('game', game.id, definition?.name || game.id)} disabled={saving} /><span>{chestTypeName(game.chestType)} · {gamePurposeCopy[game.purpose]} · 顺序 {game.order}</span><h4>{definition?.name || '未找到游戏内容'}<small>{definition?.ruleReference || game.gameContentId || '未关联'}</small></h4><p>{game.questionCount} 题 · {wordCount} 个词汇 · {itemStatusCopy[game.status]}</p>{game.fallbackGameContentId && <small>降级：{gameDefinition(game.fallbackGameContentId)?.name || game.fallbackGameContentId}</small>}<code>{game.chestType} → {game.gameContentId || '未关联'}</code></article> })}</div>}
    </ContentPanel>

    <ContentPanel title="背景音乐配置" description="每座城市仅保留一条全城背景音乐配置；在编辑窗口上传音频，删除配置会同时删除该城市的音频文件。" onAdd={city.backgroundMusic.length ? undefined : () => onEditEntity({ kind: 'music', isNew: true, value: blankMusic(city.id) })}>
      {city.backgroundMusic.length === 0 ? <EmptyContent text="尚未上传城市背景音乐。" /> : <div className="city-entity-grid">{city.backgroundMusic.map((music) => <article className="city-entity-card city-music-card" key={music.id}><EntityCardActions onEdit={() => onEditEntity({ kind: 'music', isNew: false, value: { ...music } })} onRemove={() => onRemoveEntity('music', music.id, music.name)} disabled={saving} /><span>全城唯一背景音乐 · {itemStatusCopy[music.status]}</span><h4>{music.name}</h4><p>{music.originalName || '已关联音频文件'}</p>{music.audioUrl && <audio controls loop={music.loop} preload="metadata" src={music.audioUrl}>当前浏览器不支持音频试听。</audio>}<small>{music.loop ? '循环播放（默认）' : '单次播放'} · 音量 {music.volume}% · 淡入淡出 {music.fadeSeconds} 秒</small><code>{music.resourceRef}</code></article>)}</div>}
    </ContentPanel>
    {entityEditor}
    {petPoolEditor}
  </section>
}

function PetPoolEditor({ city, chestType, availableChestTypes, petContent, saving, onChangeChestType, onCancel, onSave }: { city: City; chestType: ChestType; availableChestTypes: ChestType[]; petContent: PetContentPet[]; saving: boolean; onChangeChestType: (value: ChestType) => void; onCancel: () => void; onSave: (chestType: ChestType, pets: CityPet[]) => void }) {
  const [pets, setPets] = useState<CityPet[]>(() => city.pets.filter((pet) => pet.chestType === chestType).map((pet) => ({ ...pet })))
  const hasExistingConfiguration = city.pets.some((pet) => pet.chestType === chestType)
  const enabledTotal = Math.round(pets.filter((pet) => pet.enabled).reduce((sum, pet) => sum + (Number.isFinite(pet.weight) ? pet.weight : 0), 0) * 100) / 100
  const isBalanced = enabledTotal === 100
  const hasMissingPet = pets.some((pet) => !pet.petContentId)
  const hasDuplicatePet = new Set(pets.map((pet) => pet.petContentId).filter(Boolean)).size !== pets.filter((pet) => pet.petContentId).length
  const canSave = pets.length > 0 && isBalanced && !hasMissingPet && !hasDuplicatePet
  const updatePet = (id: string, patch: Partial<CityPet>) => setPets((current) => current.map((pet) => pet.id === id ? { ...pet, ...patch } : pet))
  const addPet = () => setPets((current) => [...current, { ...blankPet(city.id), id: `${city.id}_pet_drop_${Date.now()}_${current.length + 1}`, chestType }])
  const removePet = (id: string) => setPets((current) => current.filter((pet) => pet.id !== id))
  const validationText = hasMissingPet ? '请为每一行选择宠物内容。' : hasDuplicatePet ? '同一宝箱类型不能重复配置同一只宠物。' : isBalanced ? '启用宠物掉落概率合计为 100%，可以保存。' : `当前启用宠物掉落概率合计为 ${enabledTotal}%，保存时必须恰好为 100%。`
  return <form className="city-entity-editor pet-pool-editor" onSubmit={(event) => { event.preventDefault(); onSave(chestType, pets) }}><header><div><span>PET DROP POOL</span><h3>配置{chestTypeCopy[chestType]}宠物池</h3></div><button type="button" onClick={onCancel}><X size={17} /></button></header><div className="pet-pool-meta"><label className="pet-pool-type-select"><span>适用宝箱类型 *</span><select aria-label="适用宝箱类型" value={chestType} onChange={(event) => onChangeChestType(event.target.value as ChestType)}>{availableChestTypes.map((type) => <option key={type} value={type}>{chestTypeCopy[type]}{city.pets.some((pet) => pet.chestType === type) ? '（已有配置）' : '（未配置）'}</option>)}</select><small>{hasExistingConfiguration ? '该宝箱类型已有唯一配置；正在编辑该配置。' : '该宝箱类型尚未配置；保存后将创建唯一配置。'}</small></label><div className={isBalanced ? '' : 'invalid'}><span>启用宠物掉落概率</span><strong>{enabledTotal}<small>%</small></strong><small>{isBalanced ? '已配平，可保存' : '保存前必须调整为 100%'}</small></div></div><p className="pet-pool-type-note"><CircleAlert size={14} />每个宝箱类型在当前城市只能保留一份宠物池配置；切换类型会载入该类型的现有配置，未保存的当前改动不会保留。</p><div className="pet-pool-rows"><header><strong>宠物内容</strong><strong>掉落概率</strong><strong>参与抽取</strong><span /></header>{pets.map((pet) => <div className="pet-pool-row" key={pet.id}><select value={pet.petContentId} onChange={(event) => updatePet(pet.id, { petContentId: event.target.value })}><option value="">请选择宠物内容</option>{petContent.map((item) => <option key={item.id} value={item.id} disabled={item.id !== pet.petContentId && pets.some((current) => current.petContentId === item.id)}>{item.chineseName} · {item.spanishName}</option>)}</select><label><input type="number" min="0" max="100" step="0.01" value={pet.weight} onChange={(event) => updatePet(pet.id, { weight: Number(event.target.value) })} /><span>%</span></label><label className="city-check"><input type="checkbox" checked={pet.enabled} onChange={(event) => updatePet(pet.id, { enabled: event.target.checked })} /><span>启用</span></label><button type="button" className="pet-pool-remove" onClick={() => removePet(pet.id)} aria-label="删除宠物"><Trash2 size={14} /></button></div>)}</div><button type="button" className="button ghost pet-pool-add" onClick={addPet}><Plus size={15} /> 新增宠物</button><p className={`pet-pool-validation${canSave ? ' valid' : ''}`}>{canSave ? <><Check size={15} /> {validationText}</> : <><CircleAlert size={15} /> {validationText}</>}</p><footer><button className="button ghost" type="button" onClick={onCancel}>取消</button><button className="button primary" type="submit" disabled={saving || !canSave}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? '正在保存…' : '保存宠物池'}</button></footer></form>
}

function EntityEditor({ projectId, staticDemo, city, petContent, gameContent, draft, saving, onChange, onCancel, onSave }: { projectId: string; staticDemo: boolean; city: City; petContent: PetContentPet[]; gameContent: GameContentGame[]; draft: EntityDraft; saving: boolean; onChange: (value: EntityDraft) => void; onCancel: () => void; onSave: (event: FormEvent<HTMLFormElement>, draftOverride?: EntityDraft) => void }) {
  const update = (value: EntityDraft['value']) => onChange({ ...draft, value } as EntityDraft)
  const title = draft.kind === 'area' ? '片区' : draft.kind === 'chest' ? '宝箱' : draft.kind === 'vocabulary' ? '核心词汇' : draft.kind === 'wordLink' ? '游戏—词汇投放' : draft.kind === 'pet' ? '宝箱—宠物投放' : draft.kind === 'music' ? '背景音乐配置' : '宝箱—游戏投放'
  const value = draft.value
  const area = draft.kind === 'area' ? draft.value : null
  const chest = draft.kind === 'chest' ? draft.value : null
  const vocabulary = draft.kind === 'vocabulary' ? draft.value : null
  const wordLink = draft.kind === 'wordLink' ? draft.value : null
  const pet = draft.kind === 'pet' ? draft.value : null
  const game = draft.kind === 'game' ? draft.value : null
  const music = draft.kind === 'music' ? draft.value : null
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [audioError, setAudioError] = useState('')
  const chestTypeName = (chestType: ChestType) => chestTypeCopy[chestType]
  const availableChestTypes = [...new Set(city.chests.map((chest) => chest.type))] as ChestType[]
  const idInput = <label><span>稳定 ID *</span><input value={value.id} disabled={!draft.isNew} onChange={(event) => update({ ...value, id: event.target.value } as EntityDraft['value'])} /></label>
  const statusInput = <label><span>制作状态</span><select value={value.status} onChange={(event) => update({ ...value, status: event.target.value as ItemStatus } as EntityDraft['value'])}>{Object.entries(itemStatusCopy).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
  const uploadMusic = async (): Promise<CityMusic | null> => {
    if (!music || !audioFile || staticDemo) return null
    setUploadingAudio(true); setAudioError('')
    try {
      const formData = new FormData()
      formData.append('musicId', music.id)
      formData.append('audio', audioFile)
      const response = await fetch(`/api/projects/${projectId}/cities/${city.id}/background-music`, { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '背景音乐上传失败。')
      const nextMusic = { ...music, ...result.music, name: music.name || audioFile.name.replace(/\.[^/.]+$/, '') }
      update(nextMusic)
      setAudioFile(null)
      return nextMusic
    } catch (error) { setAudioError(error instanceof Error ? error.message : '背景音乐上传失败。'); return null } finally { setUploadingAudio(false) }
  }
  const saveMusic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!music) return onSave(event)
    if (!music.name.trim()) { setAudioError('请先填写音轨名称。'); return }
    if (audioFile) {
      const uploadedMusic = await uploadMusic()
      if (!uploadedMusic) return
      onSave(event, { ...draft, value: uploadedMusic } as EntityDraft)
      return
    }
    if (!music.resourceRef.trim()) { setAudioError('请选择音频文件后直接保存，或先点击“上传音频”。'); return }
    onSave(event)
  }
  return <form className="city-entity-editor" onSubmit={music ? saveMusic : onSave}><header><div><span>{draft.isNew ? 'NEW CONTENT' : 'EDIT CONTENT'}</span><h3>{draft.isNew ? `新增${title}` : `编辑${title}`}</h3></div><button type="button" onClick={onCancel}><X size={17} /></button></header><div className="city-entity-form">
    {idInput}
    {area && <><label><span>片区名称 *</span><input value={area.name} onChange={(event) => update({ ...area, name: event.target.value })} /></label><label><span>片区主题</span><input value={area.theme} onChange={(event) => update({ ...area, theme: event.target.value })} /></label><label><span>排序</span><input type="number" min="1" value={area.order} onChange={(event) => update({ ...area, order: Number(event.target.value) || 1 })} /></label>{statusInput}<label className="full"><span>片区说明</span><textarea rows={2} value={area.description} onChange={(event) => update({ ...area, description: event.target.value })} /></label></>}
    {chest && <><label><span>宝箱名称 *</span><input value={chest.name} onChange={(event) => update({ ...chest, name: event.target.value })} /></label><label><span>所属片区 *</span><select value={chest.areaId} onChange={(event) => update({ ...chest, areaId: event.target.value })}><option value="">请选择片区</option>{city.areas.map((area) => <option key={area.id} value={area.id}>{area.name || area.id}</option>)}</select></label><label><span>宝箱分类 *</span><select value={chest.type} onChange={(event) => update({ ...chest, type: event.target.value as ChestType })}>{Object.entries(chestTypeCopy).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>{statusInput}<label className="full"><span>关联说明</span><p className="city-reference-help">宠物仅在“宝箱类型—宠物投放”中配置，游戏仅在“宝箱类型—游戏投放”中配置；同类型宝箱共用配置，本记录不再保存宠物概率、稀有度或保底奖励。</p></label><label className="full"><span>文化彩蛋／备注</span><textarea rows={2} value={chest.culturalNote} onChange={(event) => update({ ...chest, culturalNote: event.target.value })} /></label></>}
    {vocabulary && <><label><span>西语 *</span><input value={vocabulary.spanish} onChange={(event) => update({ ...vocabulary, spanish: event.target.value })} /></label><label><span>英文 *</span><input value={vocabulary.english} onChange={(event) => update({ ...vocabulary, english: event.target.value })} /></label><label><span>中文释义 *</span><input value={vocabulary.chinese} onChange={(event) => update({ ...vocabulary, chinese: event.target.value })} /></label><label><span>类别</span><input value={vocabulary.category} onChange={(event) => update({ ...vocabulary, category: event.target.value })} placeholder="颜色、食物、地点…" /></label><label><span>所属片区</span><select value={vocabulary.areaId} onChange={(event) => update({ ...vocabulary, areaId: event.target.value })}><option value="">未关联</option>{city.areas.map((area) => <option key={area.id} value={area.id}>{area.name || area.id}</option>)}</select></label>{statusInput}<label className="full"><span>投放说明</span><p className="city-reference-help">词汇表是三语写法的唯一事实源；首次教学和后续复现请到“游戏—词汇投放”建立关系。</p></label></>}
    {wordLink && <><label><span>关联游戏 *</span><select value={wordLink.gameId} onChange={(event) => { const game = city.games.find((item) => item.id === event.target.value); update({ ...wordLink, gameId: event.target.value, role: game?.chestType === 'main' ? wordLink.role : wordLink.role === 'new' ? 'review' : wordLink.role }) }}><option value="">请选择游戏投放</option>{city.games.map((item) => <option key={item.id} value={item.id}>{gameContent.find((game) => game.id === item.gameContentId)?.name || item.gameContentId} · {chestTypeName(item.chestType)}</option>)}</select></label><label><span>核心词汇 *</span><select value={wordLink.wordId} onChange={(event) => update({ ...wordLink, wordId: event.target.value })}><option value="">请选择词汇</option>{city.vocabulary.map((word) => <option key={word.id} value={word.id}>{word.spanish} · {word.english} · {word.chinese}</option>)}</select></label><label><span>投放角色</span><select value={wordLink.role} onChange={(event) => update({ ...wordLink, role: event.target.value as WordRole })}>{Object.entries(wordRoleCopy).map(([id, label]) => <option key={id} value={id} disabled={id === 'new' && city.games.find((game) => game.id === wordLink.gameId)?.chestType !== 'main'}>{label}</option>)}</select></label><label><span>出现顺序</span><input type="number" min="1" value={wordLink.order} onChange={(event) => update({ ...wordLink, order: Number(event.target.value) || 1 })} /></label>{statusInput}</>}
    {pet && <><label><span>宠物内容 *</span><select value={pet.petContentId} onChange={(event) => update({ ...pet, petContentId: event.target.value })}><option value="">请选择宠物内容</option>{petContent.map((item) => <option key={item.id} value={item.id}>{item.chineseName} · {item.spanishName}</option>)}</select></label><label><span>适用宝箱类型 *</span><select value={availableChestTypes.includes(pet.chestType) ? pet.chestType : ''} onChange={(event) => update({ ...pet, chestType: event.target.value as ChestType })} disabled={availableChestTypes.length === 0}>{availableChestTypes.length === 0 ? <option value="">请先创建宝箱</option> : availableChestTypes.map((id) => <option key={id} value={id}>{chestTypeCopy[id]}</option>)}</select></label><label><span>掉落概率 *</span><input type="number" min="0" max="100" step="0.01" value={pet.weight} onChange={(event) => update({ ...pet, weight: Number(event.target.value) })} /><small>同一宝箱类型启用宠物合计 100%</small></label><label className="city-check"><input type="checkbox" checked={pet.enabled} onChange={(event) => update({ ...pet, enabled: event.target.checked })} /><span>参与该类型宝箱的宠物抽取</span></label>{statusInput}<label className="full"><span>引用说明</span><p className="city-reference-help">名称、稀有度、形象和动态素材来自宠物内容管理；这里仅维护该宠物在当前城市已出现的对应宝箱类型中的掉落概率，并统一应用到同类型宝箱。</p></label></>}
    {game && <><label><span>游戏内容 *</span><select value={game.gameContentId} onChange={(event) => update({ ...game, gameContentId: event.target.value })}><option value="">请选择游戏内容</option>{gameContent.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label><label><span>适用宝箱类型 *</span><select value={availableChestTypes.includes(game.chestType) ? game.chestType : ''} onChange={(event) => update({ ...game, chestType: event.target.value as ChestType })} disabled={availableChestTypes.length === 0}>{availableChestTypes.length === 0 ? <option value="">请先创建宝箱</option> : availableChestTypes.map((id) => <option key={id} value={id}>{chestTypeCopy[id]}</option>)}</select></label><label><span>用途</span><select value={game.purpose} onChange={(event) => update({ ...game, purpose: event.target.value as GamePurpose })}>{Object.entries(gamePurposeCopy).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>执行顺序</span><input type="number" min="1" value={game.order} onChange={(event) => update({ ...game, order: Number(event.target.value) || 1 })} /></label><label><span>题目数量</span><input type="number" min="1" max="20" value={game.questionCount} onChange={(event) => update({ ...game, questionCount: Number(event.target.value) || 1 })} /></label><label><span>不可用时降级游戏</span><select value={game.fallbackGameContentId} onChange={(event) => update({ ...game, fallbackGameContentId: event.target.value })}><option value="">不配置降级</option>{gameContent.filter((item) => item.id !== game.gameContentId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>{statusInput}<label className="full"><span>引用说明</span><p className="city-reference-help">游戏定义只在游戏管理维护；这里保存它在当前城市已出现的对应宝箱类型中的执行顺序、题量、用途和离线降级关系，并统一应用到同类型宝箱。</p></label></>}
    {music && <><label><span>音轨名称 *</span><input value={music.name} onChange={(event) => update({ ...music, name: event.target.value })} placeholder="例如：巴塞罗那白昼探索" /></label><label className="full city-music-upload"><span>城市背景音乐文件 *</span>{staticDemo ? <p className="city-reference-help">在线演示版不支持上传音频，请在本地平台中管理。</p> : <><div><input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,.mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} /><button type="button" className="button primary" onClick={() => void uploadMusic()} disabled={uploadingAudio || !audioFile}>{uploadingAudio ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploadingAudio ? '正在上传…' : '上传音频'}</button></div><small>{audioFile ? `待上传：${audioFile.name}` : music.originalName ? `已上传：${music.originalName}` : '支持 MP3、WAV、OGG、M4A、AAC、FLAC，最大 100 MB。'}</small>{audioError && <p className="city-music-error">{audioError}</p>}{music.audioUrl && <audio controls loop={music.loop} preload="metadata" src={music.audioUrl}>当前浏览器不支持音频试听。</audio>}</>}</label><label className="full"><span>项目资源位置</span><input value={music.resourceRef} readOnly placeholder="上传音频后自动生成" /></label><label><span>音量</span><input type="number" min="0" max="100" value={music.volume} onChange={(event) => update({ ...music, volume: Number(event.target.value) })} /></label><label><span>淡入／淡出（秒）</span><input type="number" min="0" max="30" step="0.1" value={music.fadeSeconds} onChange={(event) => update({ ...music, fadeSeconds: Number(event.target.value) })} /></label><label className="city-check"><input type="checkbox" checked={music.loop} onChange={(event) => update({ ...music, loop: event.target.checked })} /><span>循环播放（默认开启）</span></label>{statusInput}<label className="full"><span>配置说明</span><p className="city-reference-help">每座城市仅保存一条全城背景音乐。循环播放默认开启，关闭后试听和游戏内播放均只播放一次。</p></label></>}
  </div><footer><button className="button ghost" type="button" onClick={onCancel}>取消</button><button className="button primary" type="submit" disabled={saving || uploadingAudio}>{saving || uploadingAudio ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? '正在保存…' : uploadingAudio ? '正在上传…' : music && audioFile ? '保存并上传背景音乐' : `保存${title}`}</button></footer></form>
}

function VocabularyTable({ city, saving, onSave }: { city: City; saving: boolean; onSave: (value: CityVocabulary[]) => void }) {
  const [rows, setRows] = useState<CityVocabulary[]>(city.vocabulary)
  useEffect(() => { setRows(city.vocabulary) }, [city.id, city.vocabulary])

  const updateRow = (id: string, patch: Partial<CityVocabulary>) => setRows((current) => current.map((word) => word.id === id ? { ...word, ...patch } : word))
  const createRow = (index: number): CityVocabulary => ({ ...blankVocabulary(city.id), id: `${city.id}_word_${Date.now()}_${index + 1}` })
  const addRow = () => setRows((current) => [...current, createRow(current.length)])
  const removeRow = (word: CityVocabulary) => {
    if (!window.confirm(`从词汇表移除“${word.spanish || word.english || word.chinese || '未命名词汇'}”吗？保存词汇表后，关联它的宝箱投放也会一并移除。`)) return
    setRows((current) => current.filter((item) => item.id !== word.id))
  }
  const pasteFromExcel = (rowIndex: number, columnIndex: number) => (event: ClipboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    const text = event.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    event.preventDefault()
    const sourceRows = text.split(/\r?\n/).filter(Boolean).map((line) => line.split('\t').map((cell) => cell.trim()))
    const first = sourceRows[0]?.map((cell) => cell.toLocaleLowerCase()) || []
    const rowsToPaste = first.some((cell) => ['西语', 'spanish', 'español', '英文', 'english', '中文', 'chinese'].includes(cell)) ? sourceRows.slice(1) : sourceRows
    const fields: (keyof Pick<CityVocabulary, 'spanish' | 'english' | 'chinese' | 'category' | 'areaId' | 'status'>)[] = ['spanish', 'english', 'chinese', 'category', 'areaId', 'status']
    setRows((current) => {
      const next = [...current]
      rowsToPaste.forEach((cells, offset) => {
        const target = rowIndex + offset
        while (next.length <= target) next.push(createRow(next.length))
        const value = { ...next[target] }
        cells.forEach((cell, cellOffset) => {
          const field = fields[columnIndex + cellOffset]
          if (!field) return
          if (field === 'areaId') value.areaId = city.areas.find((area) => area.id === cell || area.name === cell)?.id || cell
          else if (field === 'status') {
            const status = (Object.entries(itemStatusCopy).find(([, label]) => label === cell)?.[0] || cell) as ItemStatus
            value.status = itemStatusCopy[status] ? status : 'planned'
          } else value[field] = cell
        })
        next[target] = value
      })
      return next
    })
  }

  return <>
    <div className="city-vocabulary-toolbar"><div><strong>{rows.length} 条词汇</strong><span>从 Excel 复制后，点击表格的起始单元格直接按 Ctrl+V；列顺序为西语、英文、中文、类别、所属片区、状态。</span></div><div><button className="button ghost" type="button" onClick={addRow}><Plus size={15} /> 新增一行</button><button className="button primary" type="button" onClick={() => onSave(rows)} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} 保存词汇表</button></div></div>
    <div className="city-vocabulary-table-wrap"><table className="city-vocabulary-table"><thead><tr><th>西语 *</th><th>英文 *</th><th>中文 *</th><th>类别</th><th>所属片区</th><th>状态</th><th>游戏投放</th><th>操作</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={8}><button className="city-table-empty" type="button" onClick={addRow}>尚未录入词汇。点击新增一行后，即可从 Excel 直接粘贴。</button></td></tr> : rows.map((word, rowIndex) => <tr key={word.id}><td><input aria-label={`${word.id} 西语`} value={word.spanish} onChange={(event) => updateRow(word.id, { spanish: event.target.value })} onPaste={pasteFromExcel(rowIndex, 0)} /></td><td><input aria-label={`${word.id} 英文`} value={word.english} onChange={(event) => updateRow(word.id, { english: event.target.value })} onPaste={pasteFromExcel(rowIndex, 1)} /></td><td><input aria-label={`${word.id} 中文`} value={word.chinese} onChange={(event) => updateRow(word.id, { chinese: event.target.value })} onPaste={pasteFromExcel(rowIndex, 2)} /></td><td><input aria-label={`${word.id} 类别`} value={word.category} onChange={(event) => updateRow(word.id, { category: event.target.value })} onPaste={pasteFromExcel(rowIndex, 3)} placeholder="颜色、食物…" /></td><td><select aria-label={`${word.id} 所属片区`} value={word.areaId} onChange={(event) => updateRow(word.id, { areaId: event.target.value })} onPaste={pasteFromExcel(rowIndex, 4)}><option value="">未关联</option>{city.areas.map((area) => <option key={area.id} value={area.id}>{area.name || area.id}</option>)}</select></td><td><select aria-label={`${word.id} 状态`} value={word.status} onChange={(event) => updateRow(word.id, { status: event.target.value as ItemStatus })} onPaste={pasteFromExcel(rowIndex, 5)}>{Object.entries(itemStatusCopy).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></td><td>{city.gameWordLinks.filter((link) => link.wordId === word.id).length} 次</td><td><button className="city-table-delete" type="button" onClick={() => removeRow(word)} disabled={saving}><Trash2 size={14} /> 删除</button></td></tr>)}</tbody></table></div>
  </>
}

function ContentPanel({ title, description, onAdd, addLabel, children }: { title: string; description: string; onAdd?: () => void; addLabel?: string; children: ReactNode }) { return <section className="city-panel"><header><div><h3>{title}</h3><p>{description}</p></div>{onAdd && <button className="button ghost" onClick={onAdd}><Plus size={15} /> {addLabel || `新增${title}`}</button>}</header>{children}</section> }
function SummaryCard({ icon, label, value, planned }: { icon: ReactNode; label: string; value: number; planned: number }) { return <article>{icon}<div><span>{label}</span><strong>{value}<small> / {planned || '未设计划'}</small></strong></div></article> }
function CityContentInfluenceMap() {
  const internalNode = (title: string, description: string) => <article className="city-content-influence-node"><span><Layers3 size={17} /></span><div><strong>{title}</strong><small>{description}</small></div><ChevronRight size={15} /></article>
  return <section className="city-content-influence" aria-labelledby="city-content-influence-title">
    <div className="city-content-influence-heading"><div><span className="eyebrow"><span /> CITY CONTENT REFERENCE MAP</span><h2 id="city-content-influence-title">城市内容引用关系</h2><p>城市内容管理维护实际投放关系：宝箱类型统一关联宠物和游戏，游戏再关联核心词汇；宠物与游戏的具体定义始终从对应内容管理模块引用。</p></div><span className="city-content-influence-legend"><span /> 引用或内容编排关系</span></div>
    <div className="city-content-influence-canvas">
      <div className="city-content-influence-source"><span><MapPinned size={28} strokeWidth={1.6} /></span><small>城市内容事实源</small><strong>城市内容管理</strong><p>城市 · 片区 · 宝箱<br />宠物投放 · 游戏投放 · 词汇投放<br />背景音乐配置</p></div>
      <div className="city-content-influence-connector" aria-hidden="true"><span>内容编排</span><ArrowRight size={20} /></div>
      <div className="city-content-influence-target-group">
        <div className="city-content-influence-target-title"><span>内部关系与上游引用</span><small>箭头表示数据或引用的流向</small></div>
        <div className="city-content-influence-targets">
          <div className="city-content-influence-row">{internalNode('片区', '城市的实际区域、主题和顺序')}<span className="city-content-influence-relation"><ArrowRight size={17} /></span>{internalNode('宝箱', '归属片区，是内容投放入口')}</div>
          <div className="city-content-influence-row">{internalNode('宝箱类型', '主线、隐藏等类型作为统一配置键')}<span className="city-content-influence-relation"><ArrowRight size={17} /></span><Link to="/pet-content-management" className="city-content-influence-node source"><span><MapPinned size={17} /></span><div><strong>宝箱类型—宠物投放</strong><small>引用宠物内容，维护类型概率</small></div><ChevronRight size={15} /></Link></div>
          <div className="city-content-influence-row">{internalNode('宝箱类型', '同类型宝箱共用游戏配置')}<span className="city-content-influence-relation"><ArrowRight size={17} /></span><Link to="/game-content-management" className="city-content-influence-node source"><span><Gamepad2 size={17} /></span><div><strong>宝箱类型—游戏投放</strong><small>引用游戏管理中的游戏定义</small></div><ChevronRight size={15} /></Link></div>
          <div className="city-content-influence-row">{internalNode('宝箱类型—游戏投放', '游戏按类型统一执行')}<span className="city-content-influence-relation"><ArrowRight size={17} /></span>{internalNode('游戏—词汇投放', '该游戏关联并呈现核心词汇')}</div>
          <div className="city-content-influence-row">{internalNode('游戏—词汇投放', '教学、复现或干扰词顺序')}<span className="city-content-influence-relation"><ArrowRight size={17} /></span>{internalNode('核心词汇表', '西语、英文、中文与所属片区')}</div>
          <div className="city-content-influence-row">{internalNode('城市／片区', '全城默认或按片区覆盖')}<span className="city-content-influence-relation"><ArrowRight size={17} /></span>{internalNode('背景音乐配置', '音轨、触发、循环、音量与淡入淡出')}</div>
        </div>
      </div>
    </div>
    <div className="city-content-influence-policy"><ClipboardList size={16} /><span><strong>维护边界：</strong>城市页面只保存内容实例、按宝箱类型的投放引用与音乐播放配置；具体宝箱不单独配置宠物或游戏，游戏负责关联词汇，宠物和游戏定义的变更会直接影响所有引用记录。</span></div>
  </section>
}
function EmptyContent({ text }: { text: string }) { return <div className="city-panel-empty"><CircleAlert size={17} /> {text}</div> }
function EntityCardActions({ onEdit, onRemove, disabled }: { onEdit: () => void; onRemove: () => void; disabled: boolean }) { return <div className="entity-card-actions"><button onClick={onEdit}><PencilLine size={13} /></button><button onClick={onRemove} disabled={disabled}><Trash2 size={13} /></button></div> }
