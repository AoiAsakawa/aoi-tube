import { Card, Col, Row, Typography } from 'antd';
import Link from '@components/compat/Link';
import { FC, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { LogTable } from './LogTable';
import { ConfigDetails } from '../../types/config-section';
import { ServerStatusContext } from '../../utils/server-status-context';

const { Paragraph, Text } = Typography;

const { Title } = Typography;
const { Meta } = Card;

// Lazy loaded components

const BookTwoTone = dynamic(() => import('@ant-design/icons/BookTwoTone'), {
	ssr: false,
});

const MessageTwoTone = dynamic(() => import('@ant-design/icons/MessageTwoTone'), {
	ssr: false,
});

const PlaySquareTwoTone = dynamic(() => import('@ant-design/icons/PlaySquareTwoTone'), {
	ssr: false,
});

const ProfileTwoTone = dynamic(() => import('@ant-design/icons/ProfileTwoTone'), {
	ssr: false,
});

const GiftTwoTone = dynamic(() => import('@ant-design/icons/GiftTwoTone'), {
	ssr: false,
});

function generateStreamURL(serverURL, rtmpServerPort) {
	return `rtmp://${serverURL.replace(/(^\w+:|^)\/\//, '')}:${rtmpServerPort}/live`;
}

export type OfflineProps = {
	logs: any[];
	config: ConfigDetails;
};

export const Offline: FC<OfflineProps> = ({ logs = [], config }) => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);

	const { serverConfig } = serverStatusData || {};
	const { rtmpServerPort, streamKeyOverridden } = serverConfig;
	const instanceUrl = global.window?.location.hostname || '';

	let rtmpURL;
	if (instanceUrl && rtmpServerPort) {
		rtmpURL = generateStreamURL(instanceUrl, rtmpServerPort);
	}

	const data = [
		{
			icon: <BookTwoTone twoToneColor="#6f42c1" />,
			title: t('admin.layout.offline.broadcastSoftware'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/broadcasting/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('admin.layout.offline.broadcastSoftwareLink')}
					</a>
					<div className="stream-info-container">
						<Text strong className="stream-info-label">
							{t('admin.layout.offline.streamUrl')}
						</Text>
						{rtmpURL && (
							<Paragraph className="stream-info-box" copyable>
								{rtmpURL}
							</Paragraph>
						)}
						<Text strong className="stream-info-label">
							{t('admin.layout.offline.streamKey')}
						</Text>
						<Text strong className="stream-info-box">
							{!streamKeyOverridden ? (
								<Link href="/admin/config/server"> {t('admin.layout.offline.view')} </Link>
							) : (
								<span style={{ paddingLeft: '10px', fontWeight: 'normal' }}>
									{t('admin.layout.offline.overriddenByCli')}
								</span>
							)}
						</Text>
					</div>
				</div>
			),
		},
		{
			icon: <ProfileTwoTone twoToneColor="#0366d6" />,
			title: t('admin.layout.offline.forkFeatures'),
			content: (
				<div>
					<ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
						<li>
							<strong>{t('admin.layout.offline.featureStreamingTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureStreamingDesc')}
						</li>
						<li>
							<strong>{t('admin.layout.offline.featureRecordingTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureRecordingDesc')}
						</li>
						<li>
							<strong>{t('admin.layout.offline.featureDonationTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureDonationDesc')}
						</li>
						<li>
							<strong>{t('admin.layout.offline.featureOauthTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureOauthDesc')}
						</li>
						<li>
							<strong>{t('admin.layout.offline.featureRtmpsTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureRtmpsDesc')}
						</li>
						<li>
							<strong>{t('admin.layout.offline.featureBackupTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureBackupDesc')}
						</li>
						<li>
							<strong>{t('admin.layout.offline.featureI18nTitle')}</strong> -{' '}
							{t('admin.layout.offline.featureI18nDesc')}
						</li>
					</ul>
					<Link href="/admin/config-social-items">
						{t('admin.layout.offline.configureSocialAuth')}
					</Link>
				</div>
			),
		},
		{
			icon: <GiftTwoTone twoToneColor="#eb2f96" />,
			title: t('admin.layout.offline.donationSetup'),
			content: (
				<div>
					{t('admin.layout.offline.donationIntro')}
					<ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
						<li>
							<Link href="/admin/config-paypay">PayPay</Link> -{' '}
							{t('admin.layout.offline.donationPaypay')}
						</li>
						<li>
							<Link href="/admin/config-paypal">PayPal</Link> -{' '}
							{t('admin.layout.offline.donationPaypal')}
						</li>
						<li>
							<Link href="/admin/config-stripe">Stripe</Link> -{' '}
							{t('admin.layout.offline.donationStripe')}
						</li>
						<li>
							<Link href="/admin/config-metamask">Metamask</Link> -{' '}
							{t('admin.layout.offline.donationMetamask')}
						</li>
						<li>
							<Link href="/admin/config-kofi">Ko-fi</Link> -{' '}
							{t('admin.layout.offline.donationKofi')}
						</li>
						<li>
							<Link href="/admin/config-doneru">Doneru</Link> -{' '}
							{t('admin.layout.offline.donationDoneru')}
						</li>
					</ul>
					<Link href="/admin/donations">{t('admin.layout.offline.openDonationAdmin')}</Link>
				</div>
			),
		},
		{
			icon: <PlaySquareTwoTone twoToneColor="#f9826c" />,
			title: t('admin.layout.offline.embed'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/embed?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('admin.layout.offline.embedLink')}
					</a>
				</div>
			),
		},
	];

	if (!config?.chatDisabled) {
		data.push({
			icon: <MessageTwoTone twoToneColor="#0366d6" />,
			title: t('admin.layout.offline.chatDisabledTitle'),
			content: <span>{t('admin.layout.offline.chatDisabledDesc')}</span>,
		});
	}

	if (!config?.yp?.enabled) {
		data.push({
			icon: <ProfileTwoTone twoToneColor="#D18BFE" />,
			title: t('admin.layout.offline.directoryTitle'),
			content: (
				<div>
					{t('admin.layout.offline.directoryPromo')}{' '}
					<Link href="/admin/config/general/">{t('admin.layout.offline.directorySettings')}</Link>
					{t('admin.layout.offline.directoryEnableSuffix')}
				</div>
			),
		});
	}

	if (!config?.federation?.enabled) {
		data.push({
			icon: <img alt="fediverse" width="20px" src="/img/fediverse-color.png" />,
			title: t('admin.layout.offline.fediverseTitle'),
			content: (
				<div>
					<Link href="/admin/config-federation/">
						{t('admin.layout.offline.fediverseEnableLink')}
					</Link>
					{t('admin.layout.offline.fediverseDesc')}
				</div>
			),
		});
	}

	return (
		<>
			<Row>
				<Col span={12} offset={6}>
					<div className="offline-intro">
						<span className="logo">
							{/* The operator-configured site logo, matching the viewer header. */}
							<img src="/logo" alt="" className="logo-svg" />
						</span>
						<div>
							<Title level={2}>{t('admin.layout.offline.notActiveTitle')}</Title>
							<p>{t('admin.layout.offline.notActiveDesc')}</p>
						</div>
					</div>
				</Col>
			</Row>
			<Row gutter={[16, 16]} className="offline-content">
				<Col span={24} className="list-section">
					{data.map(item => (
						<Card key={item.title} size="small" bordered={false}>
							<Meta avatar={item.icon} title={item.title} description={item.content} />
						</Card>
					))}
				</Col>
			</Row>
			<LogTable logs={logs} pageSize={5} />
		</>
	);
};
