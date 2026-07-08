import { FC } from 'react';
import { MarkdownDocPage } from '../components/ui/MarkdownDocPage/MarkdownDocPage';
import { TOKUSHOHO_PUBLIC } from '../utils/apis';

// Public commercial-transactions-act (tokushoho) disclosure page:
// admin-authored markdown rendered on the shared document shell.
const TokushohoPage: FC = () => (
	<MarkdownDocPage titleKey="ui.footer.tokushoho" endpoint={TOKUSHOHO_PUBLIC} />
);

export default TokushohoPage;
