import { Select } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCY_OPTIONS, CurrencyOption } from '../../utils/currency-constants';

const { Option } = Select;

export type CurrencySelectProps = {
	value: string;
	onChange: (value: string) => void;
	/**
	 * Optional subset of canonical currency codes to offer. The prop also
	 * fixes the display order, so each page keeps its existing option order.
	 */
	currencies?: string[];
	disabled?: boolean;
};

/**
 * Currency picker shared by the payment config pages. Option values are the
 * ISO currency codes submitted to the API; labels come from the shared
 * admin.config.shared.currencies.<code> i18n keys.
 */
export const CurrencySelect: FC<CurrencySelectProps> = ({
	value,
	onChange,
	currencies,
	disabled,
}) => {
	const { t } = useTranslation();

	const options = currencies
		? currencies
				.map(code => CURRENCY_OPTIONS.find(option => option.code === code))
				.filter((option): option is CurrencyOption => Boolean(option))
		: CURRENCY_OPTIONS;

	return (
		<Select
			value={value}
			onChange={onChange}
			disabled={disabled}
			style={{ width: 300, marginTop: 8 }}
			showSearch
			optionFilterProp="children"
		>
			{options.map(currency => (
				<Option key={currency.code} value={currency.code}>
					{t(`admin.config.shared.currencies.${currency.code}`)}
				</Option>
			))}
		</Select>
	);
};
