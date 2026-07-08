import type { Meta, StoryFn } from '@storybook/react-vite';
import { ChatDonationMessage, ChatDonationMessageProps } from './ChatDonationMessage';

export default {
	title: 'owncast/Chat/Donation Message',
	component: ChatDonationMessage,
	parameters: {
		docs: {
			description: {
				component:
					'チャット内に表示されるスーパーチャットメッセージコンポーネント。法定通貨は金額ティアで色分け（YouTube準拠）、暗号通貨は金色、画面演出購入は1行表示。',
			},
		},
	},
} as Meta<typeof ChatDonationMessage>;

const Template: StoryFn<typeof ChatDonationMessage> = args => <ChatDonationMessage {...args} />;

const baseDonation: ChatDonationMessageProps = {
	amount: 500,
	currency: 'JPY',
	message: 'いつも配信ありがとうございます！',
	displayName: 'サポーター太郎',
	isAnonymous: false,
	timestamp: new Date(),
};

// --- Superchat amount tiers (JPY) ---

export const Tier1Blue = Template.bind({});
Tier1Blue.args = {
	...baseDonation,
	amount: 100,
	message: '応援しています！',
};

export const Tier2LightBlue = Template.bind({});
Tier2LightBlue.args = {
	...baseDonation,
	amount: 200,
	message: 'ナイス配信！',
};

export const Tier3Green = Template.bind({});
Tier3Green.args = {
	...baseDonation,
	amount: 500,
};

export const Tier4Yellow = Template.bind({});
Tier4Yellow.args = {
	...baseDonation,
	amount: 1000,
	message: 'これからも頑張ってください！',
};

export const Tier5Orange = Template.bind({});
Tier5Orange.args = {
	...baseDonation,
	amount: 2000,
	message: '今日の配信最高でした！',
};

export const Tier6Magenta = Template.bind({});
Tier6Magenta.args = {
	...baseDonation,
	amount: 5000,
	message: '記念配信おめでとうございます！',
	displayName: 'スーパーファン',
};

export const Tier7Red = Template.bind({});
Tier7Red.args = {
	...baseDonation,
	amount: 10000,
	message: '一周年おめでとう！これからもずっと応援しています！',
	displayName: 'トップサポーター',
};

// --- Variations ---

export const AnonymousDonation = Template.bind({});
AnonymousDonation.args = {
	...baseDonation,
	amount: 1000,
	message: '応援しています',
	displayName: '',
	isAnonymous: true,
};

export const NoMessageDonation = Template.bind({});
NoMessageDonation.args = {
	...baseDonation,
	amount: 300,
	message: '',
	displayName: 'シンプルさん',
};

export const USDDonation = Template.bind({});
USDDonation.args = {
	...baseDonation,
	amount: 1000, // $10.00 in cents
	currency: 'USD',
	message: 'Great stream!',
	displayName: 'John Doe',
};

// Crypto donations without a JPY conversion keep the classic gold styling.
export const CryptoDonation = Template.bind({});
CryptoDonation.args = {
	...baseDonation,
	amount: 5000000, // 0.05 ETH stored as 1e8 units
	currency: 'ETH',
	message: 'To the moon!',
	displayName: 'クリプト次郎',
};

// Crypto donations with a server-recorded JPY conversion show
// "¥1,234（0.01 ETH）" and take the JPY tier color (here: yellow).
export const CryptoDonationWithJpy = Template.bind({});
CryptoDonationWithJpy.args = {
	...baseDonation,
	amount: 1000000, // 0.01 ETH stored as 1e8 units
	currency: 'ETH',
	amountJpy: 1234,
	message: 'gm!',
	displayName: 'クリプト次郎',
};

// High-value converted crypto lands in the red 10,000+ JPY tier.
export const CryptoDonationWithJpyRedTier = Template.bind({});
CryptoDonationWithJpyRedTier.args = {
	...baseDonation,
	amount: 20000000, // 0.2 ETH stored as 1e8 units
	currency: 'ETH',
	amountJpy: 120000,
	message: 'WAGMI! 応援しています！',
	displayName: 'ホエールさん',
};

// Bitcoin with a small conversion lands in the low blue tier.
export const CryptoDonationWithJpyBtc = Template.bind({});
CryptoDonationWithJpyBtc.args = {
	...baseDonation,
	amount: 10000, // 0.0001 BTC stored as 1e8 units (satoshi)
	currency: 'BTC',
	amountJpy: 150,
	message: '',
	displayName: 'サトシ',
};

// --- Screen effect purchases (single-line rendering) ---

export const EffectConfetti = Template.bind({});
EffectConfetti.args = {
	...baseDonation,
	message: '',
	itemType: 'effect',
	effectType: 'confetti',
};

export const EffectFireworks = Template.bind({});
EffectFireworks.args = {
	...baseDonation,
	message: '',
	itemType: 'effect',
	effectType: 'fireworks',
};

export const EffectHearts = Template.bind({});
EffectHearts.args = {
	...baseDonation,
	message: '',
	itemType: 'effect',
	effectType: 'hearts',
};

export const EffectStars = Template.bind({});
EffectStars.args = {
	...baseDonation,
	message: '',
	itemType: 'effect',
	effectType: 'stars',
};

export const EffectCelebration = Template.bind({});
EffectCelebration.args = {
	...baseDonation,
	message: '',
	itemType: 'effect',
	effectType: 'celebration',
};

export const EffectAnonymous = Template.bind({});
EffectAnonymous.args = {
	...baseDonation,
	message: '',
	displayName: '',
	isAnonymous: true,
	itemType: 'effect',
	effectType: 'fireworks',
};
