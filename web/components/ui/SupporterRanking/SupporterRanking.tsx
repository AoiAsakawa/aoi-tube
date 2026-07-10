import { FC, useEffect, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { SUPPORTERS, getUnauthedData } from '../../../utils/apis';
import styles from './SupporterRanking.module.scss';

interface Supporter {
	name: string;
	total: number; // base-currency smallest unit
}

// Currencies whose smallest unit IS the main unit (no minor unit), so the
// stored total is already the displayable amount. Mirrors the server-side
// IsZeroDecimalCurrency list.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD']);

const formatAmount = (total: number, currency: string): string => {
	const cur = currency || 'JPY';
	const zero = ZERO_DECIMAL.has(cur);
	const value = zero ? total : total / 100;
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: cur,
			maximumFractionDigits: zero ? 0 : 2,
		}).format(value);
	} catch {
		return `${value}`;
	}
};

// Public supporter ranking: the top spenders by total Super Chat + effect
// amount. Refreshes on an interval; renders nothing until there is data.
export const SupporterRanking: FC = () => {
	const { t } = useTranslation();
	const [supporters, setSupporters] = useState<Supporter[]>([]);
	const [currency, setCurrency] = useState('JPY');

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const res = await getUnauthedData(`${SUPPORTERS}?limit=5`);
				if (cancelled || res instanceof Error) {
					return;
				}
				setSupporters(Array.isArray(res.supporters) ? res.supporters : []);
				setCurrency(res.baseCurrency || 'JPY');
			} catch {
				/* transient; keep the previous list */
			}
		};
		load();
		const timer = setInterval(load, 60_000);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);

	if (supporters.length === 0) {
		return null;
	}

	return (
		<div className={styles.root}>
			<div className={styles.header}>{t('supporters.title')}</div>
			<ol className={styles.list}>
				{supporters.map((s, i) => (
					<li key={s.name} className={styles.item}>
						<span className={classNames(styles.rank, { [styles.top]: i < 3 })}>{i + 1}</span>
						<span className={styles.name} title={s.name}>
							{s.name}
						</span>
						<span className={styles.amount}>{formatAmount(s.total, currency)}</span>
					</li>
				))}
			</ol>
		</div>
	);
};

export default SupporterRanking;
