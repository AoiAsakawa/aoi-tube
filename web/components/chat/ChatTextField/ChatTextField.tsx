import { Popover } from 'antd';
import React, { FC, useMemo, useState, useEffect } from 'react';
import { Transforms, createEditor, BaseEditor, Text, Descendant, Editor } from 'slate';
import {
	Slate,
	DefaultPlaceholder,
	Editable,
	withReact,
	ReactEditor,
	useSelected,
	useFocused,
} from 'slate-react';
import dynamic from '@components/compat/dynamic';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useWebsocketService } from '../../stores/zustand-store';
import { MessageType } from '../../../interfaces/socket-events';
import {
	fetchData,
	PAYPAY_STATUS,
	METAMASK_STATUS,
	DONERU_STATUS,
	KOFI_STATUS,
	PAYPAL_STATUS,
	STRIPE_STATUS,
	PAYMENTS_STATUS,
} from '../../../utils/apis';
import styles from './ChatTextField.module.scss';
import { PayPalConfig, StripeConfig } from '../DonationForm';

// Lazy loaded components

const EmojiPicker = dynamic(() => import('./EmojiPicker').then(mod => mod.EmojiPicker), {
	ssr: false,
});

const SendOutlined = dynamic(() => import('@ant-design/icons/SendOutlined'), {
	ssr: false,
});

const SmileOutlined = dynamic(() => import('@ant-design/icons/SmileOutlined'), {
	ssr: false,
});

const GiftOutlined = dynamic(() => import('@ant-design/icons/GiftOutlined'), {
	ssr: false,
});

import { DonationForm } from '../DonationForm';

type CustomElement = { type: 'paragraph' | 'span'; children: CustomText[] } | ImageNode;
type CustomText = { text: string };

type EmptyText = {
	text: string;
};

type ImageNode = {
	type: 'image';
	alt: string;
	src: string;
	name: string;
	children: EmptyText[];
};

declare module 'slate' {
	interface CustomTypes {
		Editor: BaseEditor & ReactEditor;
		Element: CustomElement;
		Text: CustomText;
	}
}

const Image = p => {
	const { attributes, element, children } = p;

	const selected = useSelected();
	const focused = useFocused();
	return (
		<span {...attributes} contentEditable={false}>
			<img
				alt={element.alt}
				src={element.src}
				title={element.name}
				style={{
					display: 'inline',
					maxWidth: '50px',
					maxHeight: '20px',
					boxShadow: `${selected && focused ? '0 0 0 3px #B4D5FF' : 'none'}`,
				}}
			/>
			{children}
		</span>
	);
};

const withImages = editor => {
	const { isVoid } = editor;

	editor.isVoid = element => (element.type === 'image' ? true : isVoid(element));
	editor.isInline = element => element.type === 'image';

	return editor;
};

const serialize = node => {
	if (Text.isText(node)) {
		const string = node.text;
		return string;
	}

	let children;
	if (node.children.length === 0) {
		children = [{ text: '' }];
	} else {
		children = node.children?.map(n => serialize(n)).join('');
	}

	switch (node.type) {
		case 'paragraph':
			return `<p>${children}</p>`;
		case 'image':
			return `<img src="${node.src}" alt="${node.alt}" title="${node.name}" class="emoji"/>`;
		default:
			return children;
	}
};

const getCharacterCount = node => {
	if (Text.isText(node)) {
		return node.text.length;
	}
	if (node.type === 'image') {
		return 5;
	}

	let count = 0;
	node.children.forEach(child => {
		count += getCharacterCount(child);
	});

	return count;
};

export type ChatTextFieldProps = {
	defaultText?: string;
	enabled: boolean;
	focusInput: boolean;
	displayName?: string;
};

const characterLimit = 300;

export const ChatTextField: FC<ChatTextFieldProps> = ({
	defaultText,
	enabled,
	focusInput,
	displayName = '',
}) => {
	const { t } = useTranslation();
	const [showEmojis, setShowEmojis] = useState(false);
	const [showDonationForm, setShowDonationForm] = useState(false);
	const [characterCount, setCharacterCount] = useState(defaultText?.length);
	const [paypayEnabled, setPaypayEnabled] = useState<boolean>(false);
	const [metamaskEnabled, setMetamaskEnabled] = useState<boolean>(false);
	const [doneruEnabled, setDoneruEnabled] = useState<boolean>(false);
	const [kofiEnabled, setKofiEnabled] = useState<boolean>(false);
	const [paypalEnabled, setPaypalEnabled] = useState<boolean>(false);
	const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
	const [stripeEnabled, setStripeEnabled] = useState<boolean>(false);
	const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
	const [coinEnabled, setCoinEnabled] = useState<boolean>(false);
	const [coinBonusPercent, setCoinBonusPercent] = useState<number>(0);
	const websocketService = useWebsocketService();
	const editor = useMemo(() => withReact(withImages(createEditor())), []);

	// Check payment methods on mount
	useEffect(() => {
		const checkPaymentMethods = async () => {
			try {
				const normalizePayPalConfig = (paypal: any): PayPalConfig | null => {
					if (!paypal || !paypal.enabled) return null;
					return {
						enabled: true,
						currencyCode: paypal.currencyCode || 'USD',
						isSandbox: Boolean(paypal.isSandbox),
					};
				};

				const normalizeStripeConfig = (stripe: any): StripeConfig | null => {
					if (!stripe || !stripe.enabled) return null;
					return {
						enabled: true,
						currencyCode: stripe.currencyCode || 'JPY',
						isTestMode: Boolean(stripe.isTestMode),
						publishableKey: stripe.publishableKey || '',
					};
				};

				// Prefer aggregated status endpoint
				try {
					const paymentsStatus = await fetchData(PAYMENTS_STATUS, { auth: false });
					setPaypayEnabled(Boolean(paymentsStatus?.paypay?.enabled));
					setMetamaskEnabled(Boolean(paymentsStatus?.metamask?.enabled));
					setDoneruEnabled(Boolean(paymentsStatus?.doneru?.enabled));
					setKofiEnabled(Boolean(paymentsStatus?.kofi?.enabled));
					setPaypalEnabled(Boolean(paymentsStatus?.paypal?.enabled));
					setPaypalConfig(normalizePayPalConfig(paymentsStatus?.paypal));
					setStripeEnabled(Boolean(paymentsStatus?.stripe?.enabled));
					setStripeConfig(normalizeStripeConfig(paymentsStatus?.stripe));
					setCoinEnabled(Boolean(paymentsStatus?.coin?.enabled));
					setCoinBonusPercent(Number(paymentsStatus?.coin?.bonusPercent) || 0);
					return;
				} catch (_error) {
					// Fall back to per-provider status endpoints
				}

				const [
					paypayResponse,
					metamaskResponse,
					doneruResponse,
					kofiResponse,
					paypalResponse,
					stripeResponse,
				] = await Promise.all([
					fetchData(PAYPAY_STATUS, { auth: false }).catch(() => ({ enabled: false })),
					fetchData(METAMASK_STATUS, { auth: false }).catch(() => ({ enabled: false })),
					fetchData(DONERU_STATUS, { auth: false }).catch(() => ({ enabled: false })),
					fetchData(KOFI_STATUS, { auth: false }).catch(() => ({ enabled: false })),
					fetchData(PAYPAL_STATUS, { auth: false }).catch(() => ({ enabled: false })),
					fetchData(STRIPE_STATUS, { auth: false }).catch(() => ({ enabled: false })),
				]);
				setPaypayEnabled(Boolean(paypayResponse.enabled));
				setMetamaskEnabled(Boolean(metamaskResponse.enabled));
				setDoneruEnabled(Boolean(doneruResponse.enabled));
				setKofiEnabled(Boolean(kofiResponse.enabled));
				setPaypalEnabled(Boolean(paypalResponse.enabled));
				setPaypalConfig(normalizePayPalConfig(paypalResponse));
				setStripeEnabled(Boolean(stripeResponse.enabled));
				setStripeConfig(normalizeStripeConfig(stripeResponse));
			} catch (_error) {
				setPaypayEnabled(false);
				setMetamaskEnabled(false);
				setDoneruEnabled(false);
				setKofiEnabled(false);
				setPaypalEnabled(false);
				setPaypalConfig(null);
				setStripeEnabled(false);
				setStripeConfig(null);
			}
		};
		checkPaymentMethods();
	}, []);

	const defaultEditorValue: Descendant[] = [
		{
			type: 'paragraph',
			children: [{ text: defaultText || '' }],
		},
	];

	const sendMessage = () => {
		if (!websocketService) {
			console.log('websocketService is not defined');
			return;
		}

		let message = serialize(editor);
		// Strip the opening and closing <p> tags.
		message = message.replace(/^<p>|<\/p>$/g, '');
		websocketService.send({ type: MessageType.CHAT, body: message });

		// Clear the editor.
		Transforms.delete(editor, {
			at: {
				anchor: Editor.start(editor, []),
				focus: Editor.end(editor, []),
			},
		});
		setCharacterCount(0);
	};

	const createImageNode = (alt, src, name): ImageNode => ({
		type: 'image',
		alt,
		src,
		name,
		children: [{ text: '' }],
	});

	const insertImage = (url, name) => {
		if (!url) return;

		const image = createImageNode(name, url, name);

		Transforms.insertNodes(editor, image);
		Editor.normalize(editor, { force: true });
	};

	// Native emoji
	const onEmojiSelect = (emoji: string) => {
		ReactEditor.focus(editor);
		Transforms.insertText(editor, emoji);
	};

	const onCustomEmojiSelect = (name: string, emoji: string) => {
		ReactEditor.focus(editor);
		insertImage(emoji, name);
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		const charCount = getCharacterCount(editor) + 1;

		// Send the message when hitting enter.
		if (e.key === 'Enter') {
			e.preventDefault();
			sendMessage();
			return;
		}

		// Always allow backspace.
		if (e.key === 'Backspace') {
			setCharacterCount(charCount - 1);
			return;
		}

		// Limit the number of characters.
		if (charCount + 1 > characterLimit) {
			e.preventDefault();
		}

		setCharacterCount(charCount + 1);
	};

	const onPaste = (e: React.ClipboardEvent) => {
		const text = e.clipboardData.getData('text/plain');

		const { length } = text;
		if (characterCount + length > characterLimit) {
			e.preventDefault();
		}
	};

	const renderElement = p => {
		switch (p.element.type) {
			case 'image':
				return <Image {...p} />;
			default:
				return <p {...p} />;
		}
	};

	return (
		<div id="chat-input" className={styles.root}>
			<div
				className={classNames(
					styles.inputWrap,
					characterCount >= characterLimit && styles.maxCharacters,
				)}
			>
				<Slate editor={editor} initialValue={defaultEditorValue}>
					<Editable
						className="chat-text-input"
						onKeyDown={onKeyDown}
						onPaste={onPaste}
						disabled={!enabled}
						readOnly={!enabled}
						renderElement={renderElement}
						renderPlaceholder={({ children, attributes }) => (
							<DefaultPlaceholder
								attributes={{
									...attributes,
									style: { ...attributes.style, top: '15%' },
								}}
							>
								{children}
							</DefaultPlaceholder>
						)}
						placeholder={enabled ? t('chat.sendMessage') : t('chat.chatUnavailable')}
						style={{ width: '100%' }}
						role="textbox"
						aria-label={t('chat.chatTextInput')}
						autoFocus={focusInput}
					/>
					<Popover
						content={
							<EmojiPicker
								onEmojiSelect={onEmojiSelect}
								onCustomEmojiSelect={onCustomEmojiSelect}
							/>
						}
						trigger="click"
						placement="topRight"
						onOpenChange={open => setShowEmojis(open)}
						open={showEmojis}
					/>
				</Slate>

				{enabled && (
					<div style={{ display: 'flex', paddingLeft: '5px' }}>
						<button
							type="button"
							className={styles.emojiButton}
							title={t('chat.emojiPicker')}
							onClick={() => setShowEmojis(!showEmojis)}
						>
							<SmileOutlined />
						</button>
						{(paypayEnabled ||
							metamaskEnabled ||
							doneruEnabled ||
							kofiEnabled ||
							paypalEnabled ||
							stripeEnabled) && (
							<button
								type="button"
								className={styles.donationButton}
								title={t('chat.sendDonation')}
								onClick={() => setShowDonationForm(true)}
							>
								<GiftOutlined />
							</button>
						)}
						<button
							type="button"
							className={styles.sendButton}
							title={t('chat.sendMessage')}
							onClick={sendMessage}
						>
							<SendOutlined />
						</button>
					</div>
				)}
			</div>
			<DonationForm
				visible={showDonationForm}
				onClose={() => setShowDonationForm(false)}
				defaultDisplayName={displayName}
				paypayEnabled={paypayEnabled}
				metamaskEnabled={metamaskEnabled}
				doneruEnabled={doneruEnabled}
				kofiEnabled={kofiEnabled}
				paypalEnabled={paypalEnabled}
				paypalConfig={paypalConfig}
				stripeEnabled={stripeEnabled}
				stripeConfig={stripeConfig}
				coinEnabled={coinEnabled}
				coinBonusPercent={coinBonusPercent}
			/>
		</div>
	);
};
