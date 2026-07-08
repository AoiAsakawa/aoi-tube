import { FC } from 'react';
import { MarkdownDocPage } from '../components/ui/MarkdownDocPage/MarkdownDocPage';
import { FAQ_PUBLIC } from '../utils/apis';

// Public FAQ page: admin-authored markdown rendered on the shared document shell.
const FAQPage: FC = () => <MarkdownDocPage titleKey="ui.footer.faq" endpoint={FAQ_PUBLIC} />;

export default FAQPage;
