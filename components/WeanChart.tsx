import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ScheduleStep } from '../types';

interface WeanChartProps {
  steps: ScheduleStep[];
  unit: string;
  isDarkMode?: boolean;
}

const WeanChart: React.FC<WeanChartProps> = ({ steps, unit, isDarkMode }) => {
  const data = steps.map(step => ({
    date: step.date,
    dose: step.actualDose,
    ideal: step.targetDose
  }));

  return (
    <div className="h-64 w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 transition-colors duration-200">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">Projected Taper Curve</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#f1f5f9"} />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 10, fill: '#94a3b8' }} 
            tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}
          />
          <YAxis 
            tick={{ fontSize: 10, fill: '#94a3b8' }} 
            label={{ value: unit, angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 10 } }} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderRadius: '8px', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            itemStyle={{ fontSize: '12px', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}
            formatter={(value: number) => [`${value} ${unit}`, 'Dose']}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
          />
          <Line 
            type="monotone" 
            dataKey="dose" 
            stroke="#0ea5e9" 
            strokeWidth={2} 
            dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }} 
            activeDot={{ r: 5 }}
            name="Actual Dose"
          />
          <Line 
            type="monotone" 
            dataKey="ideal" 
            stroke="#94a3b8" 
            strokeWidth={2} 
            strokeDasharray="5 5" 
            dot={false}
            name="Ideal Target"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WeanChart;