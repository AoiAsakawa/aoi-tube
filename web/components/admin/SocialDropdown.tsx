import React, { FC } from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { SocialHandleDropdownItem } from '../../types/config-section';
import { OTHER_SOCIAL_HANDLE_OPTION } from '../../utils/config-constants';

export type DropdownProps = {
	iconList: SocialHandleDropdownItem[];
	selectedOption: string;
	onSelected: any;
};

export const SocialDropdown: FC<DropdownProps> = ({ iconList, selectedOption, onSelected }) => {
	const { t } = useTranslation();
	const handleSelected = (value: string) => {
		if (onSelected) {
			onSelected(value);
		}
	};
	const inititalSelected = selectedOption === '' ? null : selectedOption;
	return (
		<div className="social-dropdown-container">
			<p className="description">{t('admin.layout.socialDropdown.description')}</p>

			<div className="formfield-container">
				<div className="label-side">
					<span className="formfield-label">{t('admin.layout.socialDropdown.platformLabel')}</span>
				</div>
				<div className="input-side">
					<Select
						style={{ width: 240 }}
						className="social-dropdown"
						// Attach the token-based theme class straight onto the popup so it
						// cannot lose the cascade against modal/global styles. Its colors
						// flip with data-theme (see ant-overrides.scss).
						popupClassName="admin-dark-dropdown"
						placeholder={t('admin.layout.socialDropdown.selectPlaceholder')}
						defaultValue={inititalSelected}
						value={inititalSelected}
						onSelect={handleSelected}
					>
						{iconList.map(item => {
							const { platform, icon, key } = item;

							return (
								<Select.Option className="social-option" key={`platform-${key}`} value={key}>
									<span className="option-icon">
										<img src={icon} alt="" className="option-icon" />
									</span>
									<span className="option-label">{platform}</span>
								</Select.Option>
							);
						})}
						<Select.Option
							className="social-option"
							key={`platform-${OTHER_SOCIAL_HANDLE_OPTION}`}
							value={OTHER_SOCIAL_HANDLE_OPTION}
						>
							{t('admin.layout.socialDropdown.other')}
						</Select.Option>
					</Select>
				</div>
			</div>
		</div>
	);
};
