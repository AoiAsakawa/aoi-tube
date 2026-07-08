import { createBrowserRouter } from 'react-router-dom';
import { TrailingSlashRedirect } from './TrailingSlashRedirect';

// Viewer (public) pages. Each page keeps its default export from pages/**; the
// former per-file getLayout is a no-op for these (index.tsx returned the page
// unchanged and the rest render their own layout).
import Home from '../../pages/index';
import Archives from '../../pages/archives';
import Faq from '../../pages/faq';
import Tokushoho from '../../pages/tokushoho';
import BouyomiChat from '../../pages/embed/chat/bouyomi/index';
import McvChat from '../../pages/embed/chat/mcv/index';
import ReadonlyChat from '../../pages/embed/chat/readonly/index';
import ReadwriteChat from '../../pages/embed/chat/readwrite/index';
import VideoEmbed from '../../pages/embed/video/index';

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
