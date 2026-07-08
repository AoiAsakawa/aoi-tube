import { format } from 'date-fns';
import { FC, useMemo, useRef } from 'react';

import { DownloadOutlined } from '@ant-design/icons';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
	LogarithmicScale,
	ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Button } from 'antd';
import { useSiteTheme } from '../../utils/useSiteTheme';

ChartJS.register(
	CategoryScale,
	LogarithmicScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
);

interface TimedValue {
	time: Date;
	value: number;
	pointStyle?: boolean | string;
	pointRadius?: number;
}

export type ChartProps = {
	data?: TimedValue[];
	title?: string;
	color: string;
	unit: string;
	yFlipped?: boolean;
	yLogarithmic?: boolean;
	dataCollections?: any[];
	minYValue?: number;
	yStepSize?: number;
};

function createGraphDataset(dataArray) {
	const dataValues = {};
	dataArray.forEach(item => {
		const dateObject = new Date(item.time);
		const dateString = format(dateObject, 'H:mma');
		dataValues[dateString] = item.value;
	});
	return dataValues;
}

export const Chart: FC<ChartProps> = ({
	data = [],
	title = '',
	color,
	unit,
	dataCollections = [],
	yFlipped = false,
	yLogarithmic = false,
	minYValue,
	yStepSize = 0,
}) => {
	const renderData = [];

	const { theme: siteTheme } = useSiteTheme();

	// Chart.js paints to a canvas, so CSS custom properties can't be used
	// directly; resolve the theme tokens to concrete values and re-read them
	// whenever the site theme changes.
	const { textColor, gridColor } = useMemo(() => {
		const styles =
			typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
		return {
			textColor: styles?.getPropertyValue('--color-panel-text').trim() || undefined,
			gridColor: styles?.getPropertyValue('--color-panel-border-soft').trim() || undefined,
		};
	}, [siteTheme]);

	const chartRef = useRef(null);
	const downloadChart = () => {
		if (chartRef.current) {
			const link = document.createElement('a');
			link.download = 'chart.png';
			link.href = chartRef.current.canvas.toDataURL();
			link.click();
		}
	};

	if (data && data.length > 0) {
		renderData.push({
			id: title,
			label: title,
			backgroundColor: color,
			borderColor: color,
			borderWidth: 3,
			data: createGraphDataset(data),
		});
	}

	dataCollections.forEach(collection => {
		renderData.push({
			id: collection.name,
			label: collection.name,
			data: createGraphDataset(collection.data),
			backgroundColor: collection.color,
			borderColor: collection.color,
			borderWidth: 3,
			pointStyle: collection.pointStyle || 'circle',
			radius: collection.pointRadius || 1,
		});
	});

	const options = {
		responsive: true,
		clip: false,

		plugins: {
			legend: {
				labels: {
					color: textColor,
				},
			},
		},

		scales: {
			x: {
				ticks: {
					color: textColor,
				},
				grid: {
					color: gridColor,
				},
				border: {
					color: gridColor,
				},
			},
			y: {
				type: yLogarithmic ? ('logarithmic' as const) : ('linear' as const),
				reverse: yFlipped,
				min: minYValue,
				ticks: {
					stepSize: yStepSize,
					color: textColor,
				},
				title: {
					display: true,
					text: unit,
					color: textColor,
				},
				grid: {
					color: gridColor,
				},
				border: {
					color: gridColor,
				},
			},
		},
	};

	return (
		<div className="line-chart-container">
			<Line
				ref={chartRef}
				data={{ datasets: renderData }}
				options={options as ChartOptions<'line'>}
				height="70vh"
			/>
			<Button
				size="small"
				onClick={downloadChart}
				type="text"
				icon={<DownloadOutlined />}
				className="download-btn"
			/>
		</div>
	);
};
