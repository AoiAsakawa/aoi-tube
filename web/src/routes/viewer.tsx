import { createBrowserRouter } from 'react-router-dom';
import dynamic from '@components/compat/dynamic';
import { TrailingSlashRedirect } from './TrailingSlashRedirect';

// Viewer (public) pages. Each page keeps its default export from pages/**; the
// former per-file getLayout is a no-op for these (index.tsx returned the page
// unchanged and the rest render their own layout).
//
// The home page is what nearly every visit lands on, so it ships in the first
// bundle. Every other page is fetched when it is navigated to: imported
// statically, the chat embeds alone dragged the whole chat, the purchase form
// and its wallet code into what every visitor downloads.
import Home from '../../pages/index';

const Archives = dynamic(() => import('../../pages/archives'));
const Faq = dynamic(() => import('../../pages/faq'));
const Tokushoho = dynamic(() => import('../../pages/tokushoho'));
const BouyomiChat = dynamic(() => import('../../pages/embed/chat/bouyomi/index'));
const McvChat = dynamic(() => import('../../pages/embed/chat/mcv/index'));
const ReadonlyChat = dynamic(() => import('../../pages/embed/chat/readonly/index'));
const ReadwriteChat = dynamic(() => import('../../pages/embed/chat/readwrite/index'));
const VideoEmbed = dynamic(() => import('../../pages/embed/video/index'));

export const viewerRouter = createBrowserRouter([
	{
		element: <TrailingSlashRedirect />,
		children: [
			{ path: '/', element: <Home /> },
			{ path: '/archives', element: <Archives /> },
			{ path: '/faq', element: <Faq /> },
			{ path: '/tokushoho', element: <Tokushoho /> },
			{ path: '/embed/chat/bouyomi', element: <BouyomiChat /> },
			{ path: '/embed/chat/mcv', element: <McvChat /> },
			{ path: '/embed/chat/readonly', element: <ReadonlyChat /> },
			{ path: '/embed/chat/readwrite', element: <ReadwriteChat /> },
			{ path: '/embed/video', element: <VideoEmbed /> },
			// Unknown viewer paths fall back to the home page.
			{ path: '*', element: <Home /> },
		],
	},
]);

export default viewerRouter;
