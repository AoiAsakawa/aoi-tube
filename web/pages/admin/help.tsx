import { Button, Card, Col, Divider, Result, Row, Typography } from 'antd';

const { Meta } = Card;
const { Title } = Typography;

import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';

import { AdminLayout } from '../../components/layouts/AdminLayout';

// Lazy loaded components

const ApiTwoTone = dynamic(() => import('@ant-design/icons/ApiTwoTone'), {
	ssr: false,
});

const BugTwoTone = dynamic(() => import('@ant-design/icons/BugTwoTone'), {
	ssr: false,
});

const CameraTwoTone = dynamic(() => import('@ant-design/icons/CameraTwoTone'), {
	ssr: false,
});

const DatabaseTwoTone = dynamic(() => import('@ant-design/icons/DatabaseTwoTone'), {
	ssr: false,
});

const EditTwoTone = dynamic(() => import('@ant-design/icons/EditTwoTone'), {
	ssr: false,
});

const Html5TwoTone = dynamic(() => import('@ant-design/icons/Html5TwoTone'), {
	ssr: false,
});

const LinkOutlined = dynamic(() => import('@ant-design/icons/LinkOutlined'), {
	ssr: false,
});

const QuestionCircleTwoTone = dynamic(() => import('@ant-design/icons/QuestionCircleTwoTone'), {
	ssr: false,
});

const SettingTwoTone = dynamic(() => import('@ant-design/icons/SettingTwoTone'), {
	ssr: false,
});

const SlidersTwoTone = dynamic(() => import('@ant-design/icons/SlidersTwoTone'), {
	ssr: false,
});

export default function Help() {
	const { t } = useTranslation();
	const questions = [
		{
			icon: <SettingTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.questions.configure'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/configuration/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						<LinkOutlined /> {t('admin.pages.help.learnMore')}
					</a>
				</div>
			),
		},
		{
			icon: <CameraTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.questions.broadcasting'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/broadcasting/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						<LinkOutlined /> {t('admin.pages.help.learnMore')}
					</a>
				</div>
			),
		},
		{
			icon: <Html5TwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.questions.embed'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/embed/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						<LinkOutlined /> {t('admin.pages.help.learnMore')}
					</a>
				</div>
			),
		},
		{
			icon: <EditTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.questions.customize'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/website/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						<LinkOutlined /> {t('admin.pages.help.learnMore')}
					</a>
				</div>
			),
		},
		{
			icon: <SlidersTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.questions.video'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/encoding/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						<LinkOutlined /> {t('admin.pages.help.learnMore')}
					</a>
				</div>
			),
		},
		{
			icon: <DatabaseTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.questions.storage'),
			content: (
				<div>
					<a
						href="https://owncast.online/docs/storage/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						<LinkOutlined /> {t('admin.pages.help.learnMore')}
					</a>
				</div>
			),
		},
	];

	const otherResources = [
		{
			icon: <BugTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.other.foundBug'),
			content: (
				<div>
					{t('admin.pages.help.other.foundBugPre')}
					<a
						href="https://github.com/AoiAsakawa/aoitube/issues/new/choose"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('admin.pages.help.other.foundBugLink')}
					</a>
				</div>
			),
		},
		{
			icon: <QuestionCircleTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.other.question'),
			content: (
				<div>
					{t('admin.pages.help.other.questionPre')}
					<a
						href="https://owncast.online/faq/?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						FAQ
					</a>{' '}
					{t('admin.pages.help.other.questionAnd')}
					<a
						href="https://github.com/AoiAsakawa/aoitube/discussions"
						target="_blank"
						rel="noopener noreferrer"
					>
						Discussions
					</a>
					{t('admin.pages.help.other.questionPost')}
				</div>
			),
		},
		{
			icon: <ApiTwoTone style={{ fontSize: '24px' }} />,
			title: t('admin.pages.help.other.addon'),
			content: (
				<div>
					{t('admin.pages.help.other.addonBody')}
					<a
						href="https://owncast.online/thirdparty?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						&nbsp;{t('admin.pages.help.other.addonLink')}&nbsp;
					</a>
				</div>
			),
		},
	];

	return (
		<div className="help-page">
			<Title style={{ textAlign: 'center' }}>{t('admin.pages.help.title')}</Title>
			<Row gutter={[16, 16]} justify="space-around" align="middle">
				<Col xs={24} lg={12} style={{ textAlign: 'center' }}>
					<Result status="500" />
					<Title level={2}>{t('admin.pages.help.troubleshooting')}</Title>
					<Button
						target="_blank"
						rel="noopener noreferrer"
						href="https://owncast.online/docs/troubleshooting/?source=admin"
						icon={<LinkOutlined />}
						type="primary"
					>
						{t('admin.pages.help.troubleshootingButton')}
					</Button>
				</Col>
				<Col xs={24} lg={12} style={{ textAlign: 'center' }}>
					<Result status="404" />
					<Title level={2}>{t('admin.pages.common.documentation')}</Title>
					<Button
						target="_blank"
						rel="noopener noreferrer"
						href="https://owncast.online/docs?source=admin"
						icon={<LinkOutlined />}
						type="primary"
					>
						{t('admin.pages.help.readDocs')}
					</Button>
				</Col>
			</Row>
			<Divider />
			<Title level={2}>{t('admin.pages.help.commonTasks')}</Title>
			<Row gutter={[16, 16]}>
				{questions.map(question => (
					<Col xs={24} lg={12} key={question.title}>
						<Card>
							<Meta avatar={question.icon} title={question.title} description={question.content} />
						</Card>
					</Col>
				))}
			</Row>
			<Divider />
			<Title level={2}>{t('admin.pages.help.otherTitle')}</Title>
			<Row gutter={[16, 16]}>
				{otherResources.map(question => (
					<Col xs={24} lg={12} key={question.title}>
						<Card>
							<Meta avatar={question.icon} title={question.title} description={question.content} />
						</Card>
					</Col>
				))}
			</Row>
		</div>
	);
}

Help.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
