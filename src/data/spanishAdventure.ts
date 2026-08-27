import type { ArtModule } from './modules'

import cityContent from '../../project-data/projects/project-1787020640273-9de50495/city-content.json'
import characterSettingSheets from '../../project-data/projects/project-1787020640273-9de50495/character-setting-sheets.json'
import gameContent from '../../project-data/projects/project-1787020640273-9de50495/game-content.json'
import mainVisualDeliverables from '../../project-data/projects/project-1787020640273-9de50495/main-visual-deliverables.json'
import modules from '../../project-data/projects/project-1787020640273-9de50495/modules.json'
import petContent from '../../project-data/projects/project-1787020640273-9de50495/pet-content.json'
import projectPlan from '../../project-data/projects/project-1787020640273-9de50495/project-plan.json'
import technicalStandards from '../../project-data/projects/project-1787020640273-9de50495/technical-standards.json'

export const spanishAdventureStaticData = {
  modules: modules as ArtModule[],
  cityContent,
  characterSettingSheets,
  gameContent,
  mainVisualDeliverables,
  petContent,
  projectPlan,
  technicalStandards,
}
