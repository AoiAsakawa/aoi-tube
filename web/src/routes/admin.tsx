import { createBrowserRouter, Outlet } from 'react-router-dom';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { TrailingSlashRedirect } from './TrailingSlashRedirect';

// Admin pages. Each keeps its default export from pages/admin/**; the former
// per-page `getLayout` (which wrapped the page in <AdminLayout page={...} />) is
// replaced by the shared AdminLayout layout route below, which renders the
// matched child through <Outlet />.
import AdminHome from '../../pages/admin/index';
import AccessTokens from '../../pages/admin/access-tokens';
import Actions from '../../pages/admin/actions';
import Archives from '../../pages/admin/archives';
import ChatManagement from '../../pages/admin/chat/index';
import ChatEmojis from '../../pages/admin/chat/emojis';
import ChatUserData from '../../pages/admin/chat/user-data';
import ConfigChat from '../../pages/admin/config-chat';
import ConfigDoneru from '../../pages/admin/config-doneru';
import ConfigFaq from '../../pages/admin/config-faq';
import ConfigFederation from '../../pages/admin/config-federation';
import ConfigGeneral from '../../pages/admin/config/general/index';
import ConfigKofi from '../../pages/admin/config-kofi';
import ConfigMetamask from '../../pages/admin/config-metamask';
import ConfigNotify from '../../pages/admin/config-notify';
import ConfigPaypal from '../../pages/admin/config-paypal';
import ConfigPaypay from '../../pages/admin/config-paypay';
import ConfigServer from '../../pages/admin/config/server/index';
import ConfigSocialItems from '../../pages/admin/config-social-items';
import ConfigStripe from '../../pages/admin/config-stripe';
import ConfigTokushoho from '../../pages/admin/config-tokushoho';
import ConfigVideo from '../../pages/admin/config-video';
import Donations from '../../pages/admin/donations';
import FederationActions from '../../pages/admin/federation/actions';
import FederationFollowers from '../../pages/admin/federation/followers';
import HardwareInfo from '../../pages/admin/hardware-info';
import Help from '../../pages/admin/help';
import LoginSettings from '../../pages/admin/login-settings';
import Logs from '../../pages/admin/logs';
import StreamHealth from '../../pages/admin/stream-health';
import ViewerInfo from '../../pages/admin/viewer-info';
import Webhooks from '../../pages/admin/webhooks';

export const adminRouter = createBrowserRouter([
	{
		element: <TrailingSlashRedirect />,
		children: [
			{
				path: '/admin',
				element: <AdminLayout page={<Outlet />} />,
				children: [
					{ index: true, element: <AdminHome /> },
					{ path: 'access-tokens', element: <AccessTokens /> },
					{ path: 'actions', element: <Actions /> },
					{ path: 'archives', element: <Archives /> },
					{ path: 'chat', element: <ChatManagement /> },
					{ path: 'chat/emojis', element: <ChatEmojis /> },
					{ path: 'chat/user-data', element: <ChatUserData /> },
					{ path: 'config-chat', element: <ConfigChat /> },
					{ path: 'config-doneru', element: <ConfigDoneru /> },
					{ path: 'config-faq', element: <ConfigFaq /> },
					{ path: 'config-federation', element: <ConfigFederation /> },
					{ path: 'config/general', element: <ConfigGeneral /> },
					{ path: 'config-kofi', element: <ConfigKofi /> },
					{ path: 'config-metamask', element: <ConfigMetamask /> },
					{ path: 'config-notify', element: <ConfigNotify /> },
					{ path: 'config-paypal', element: <ConfigPaypal /> },
					{ path: 'config-paypay', element: <ConfigPaypay /> },
					{ path: 'config/server', element: <ConfigServer /> },
					{ path: 'config-social-items', element: <ConfigSocialItems /> },
					{ path: 'config-stripe', element: <ConfigStripe /> },
					{ path: 'config-tokushoho', element: <ConfigTokushoho /> },
					{ path: 'config-video', element: <ConfigVideo /> },
					{ path: 'donations', element: <Donations /> },
					{ path: 'federation/actions', element: <FederationActions /> },
					{ path: 'federation/followers', element: <FederationFollowers /> },
					{ path: 'hardware-info', element: <HardwareInfo /> },
					{ path: 'help', element: <Help /> },
					{ path: 'login-settings', element: <LoginSettings /> },
					{ path: 'logs', element: <Logs /> },
					{ path: 'stream-health', element: <StreamHealth /> },
					{ path: 'viewer-info', element: <ViewerInfo /> },
					{ path: 'webhooks', element: <Webhooks /> },
					// Unknown admin paths fall back to the admin home.
					{ path: '*', element: <AdminHome /> },
				],
			},
		],
	},
]);

export default adminRouter;
