import type {
  DayConfig,
  DefectProfile,
  ReworkConfig,
  RuleMatrix,
  ScoringConfig,
  ToolConfig,
} from '@wafers/data';
import defectsJson from '@wafers/data/config/defects.json';
import daysJson from '@wafers/data/config/days.json';
import matricesJson from '@wafers/data/config/rule-matrices.json';
import scoringJson from '@wafers/data/config/scoring.json';
import toolsJson from '@wafers/data/config/tools.json';
import reworkJson from '@wafers/data/config/rework.json';
import type { CampaignConfig } from '@wafers/sim';

export interface GameConfig {
  readonly defects: readonly DefectProfile[];
  readonly days: readonly DayConfig[];
  readonly tools: readonly ToolConfig[];
  readonly ruleMatrices: readonly RuleMatrix[];
  readonly scoring: ScoringConfig;
  readonly rework: readonly ReworkConfig[];
}

export function loadGameConfig(): GameConfig {
  return {
    defects: (defectsJson as { defects: DefectProfile[] }).defects,
    days: (daysJson as { days: DayConfig[] }).days,
    tools: (toolsJson as { tools: ToolConfig[] }).tools,
    ruleMatrices: (matricesJson as { ruleMatrices: RuleMatrix[] }).ruleMatrices,
    scoring: (scoringJson as { scoring: ScoringConfig }).scoring,
    rework: (reworkJson as { rework: ReworkConfig[] }).rework,
  };
}

export function campaignConfigFrom(game: GameConfig, seed: number): CampaignConfig {
  return {
    days: game.days,
    rules: game.ruleMatrices,
    defects: game.defects,
    tools: game.tools,
    scoring: game.scoring,
    seed,
  };
}
