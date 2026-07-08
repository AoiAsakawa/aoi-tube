import { FC, ReactNode } from 'react';
import styles from './FormField.module.scss';

export type FormFieldProps = {
	label: ReactNode;
	description?: ReactNode;
	error?: ReactNode;
	required?: boolean;
	htmlFor?: string;
	children: ReactNode;
};

/**
 * Standard vertical field block for admin config pages: semibold label,
 * optional muted description, the control itself, and an optional error
 * line. Replaces the hand-rolled `<Text strong>` + `<br/>` + input stacks.
 */
export const FormField: FC<FormFieldProps> = ({
	label,
	description,
	error,
	required,
	htmlFor,
	children,
}) => (
	<div className={styles.field}>
		<label className={styles.label} htmlFor={htmlFor}>
			{label}
			{required && (
				<span className={styles.required} aria-hidden="true">
					*
				</span>
			)}
		</label>
		{description && <div className={styles.description}>{description}</div>}
		{children}
		{error && <div className={styles.error}>{error}</div>}
	</div>
);
