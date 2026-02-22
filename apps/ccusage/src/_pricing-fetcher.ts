import { LiteLLMPricingFetcher } from '@ccusage/internal/pricing';
import { Result } from '@praha/byethrow';
import { prefetchClaudePricing } from './_macro.ts' with { type: 'macro' };
import { logger } from './logger.ts';

const CLAUDE_PROVIDER_PREFIXES = [
	'anthropic/',
	'claude-3-5-',
	'claude-3-',
	'claude-',
	'openrouter/openai/',
];

const PREFETCHED_CLAUDE_PRICING = prefetchClaudePricing();

/**
 * Built-in model name aliases for common mismatches between Claude Code and LiteLLM.
 * Maps model names as emitted by Claude Code to their LiteLLM pricing database equivalents.
 */
const DEFAULT_MODEL_ALIASES: Record<string, string> = {
	// Claude models with dot notation → hyphen notation (LiteLLM format)
	'claude-sonnet-4.5': 'claude-sonnet-4-5',
	'gemini-3-pro-high': 'gemini-3-pro-preview',
};

export class PricingFetcher extends LiteLLMPricingFetcher {
	readonly #aliases: Record<string, string>;

	constructor(offline = false, aliases: Record<string, string> = {}) {
		super({
			offline,
			offlineLoader: async () => PREFETCHED_CLAUDE_PRICING,
			logger,
			providerPrefixes: CLAUDE_PROVIDER_PREFIXES,
		});
		this.#aliases = { ...DEFAULT_MODEL_ALIASES, ...aliases };
	}

	resolveModel(modelName: string): string {
		return this.#aliases[modelName] ?? modelName;
	}
}

if (import.meta.vitest != null) {
	describe('PricingFetcher', () => {
		it('loads offline pricing when offline flag is true', async () => {
			using fetcher = new PricingFetcher(true);
			const pricing = await Result.unwrap(fetcher.fetchModelPricing());
			expect(pricing.size).toBeGreaterThan(0);
		});

		it('calculates cost for Claude model tokens', async () => {
			using fetcher = new PricingFetcher(true);
			const pricing = await Result.unwrap(fetcher.getModelPricing('claude-sonnet-4-20250514'));
			const cost = fetcher.calculateCostFromPricing(
				{
					input_tokens: 1000,
					output_tokens: 500,
					cache_read_input_tokens: 300,
				},
				pricing!,
			);

			expect(cost).toBeGreaterThan(0);
		});

		it('resolves model aliases', () => {
			using fetcher = new PricingFetcher(true);
			// Default alias
			expect(fetcher.resolveModel('claude-sonnet-4.5')).toBe('claude-sonnet-4-5');
			// Unknown model passes through unchanged
			expect(fetcher.resolveModel('claude-unknown-model')).toBe('claude-unknown-model');
		});

		it('merges user aliases with defaults, user aliases take precedence', () => {
			using fetcher = new PricingFetcher(true, { 'my-model': 'claude-sonnet-4-20250514' });
			expect(fetcher.resolveModel('my-model')).toBe('claude-sonnet-4-20250514');
			// Default aliases still work
			expect(fetcher.resolveModel('claude-sonnet-4.5')).toBe('claude-sonnet-4-5');
		});
	});
}
