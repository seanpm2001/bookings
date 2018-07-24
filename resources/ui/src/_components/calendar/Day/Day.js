import { Component } from "preact";
import styles from "./Day.less";
import connect from "../../../_hoc/connect";
import getFirstSlot from "../../../_helpers/getFirstSlot";
import correctDate from "../../../_helpers/correctDate";
import slotExists from "../../../_helpers/slotExists";
import padZero from "../../../_helpers/padZero";

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const TIMES = [
	"10 mins",
	"20 mins",
	"30 mins",
	"40 mins",
	"50 mins",
	"60 mins",
];

class Day extends Component {

	// Properties
	// =========================================================================

	state = {
		days: [],

		formattedSlots: {},
		formattedExceptions: {},
	};

	// Preact
	// =========================================================================

	componentDidMount () {
		this.updateStateFromProps();
	}

	componentWillReceiveProps (nextProps) {
		this.updateStateFromProps(nextProps);
	}

	// Actions
	// =========================================================================

	updateStateFromProps (props = this.props) {
		const days = Day._computeDays(props)
			, formattedSlots = this._formatSlots(props.slots)
			, formattedExceptions = this._formatSlots(props.exceptions);

		this.setState({
			days,
			formattedSlots,
			formattedExceptions,
		});
	}

	// Render
	// =========================================================================

	render (_, { days }) {
		return (
			<div class={styles.scroller}>
				{days.map((day, index) => (
					<div key={index} class={styles.group}>
						{Day._renderHeader(day)}
						{Day._renderLabels()}
						{this._renderCells(day)}
					</div>
				))}
			</div>
		);
	}

	static _renderHeader (day) {
		return (
			<header class={styles.header}>
				<div>
					{TIMES.map((time, i) => (
						<span key={i}>
							{i === 0 && (
								<span>{Day._getHeader(day)}</span>
							)}
							{time}
						</span>
					))}
				</div>
			</header>
		);
	}

	static _renderLabels () {
		return (
			<ul class={styles.labels}>
				{Array.from({ length: 23 }, (_, i) => {
					let t = i + 1;

					if (t > 12) t = (t - 12) + " pm";
					else t += " am";

					return <li key={i}>{t}</li>;
				})}
			</ul>
		);
	}

	_renderCells (day) {
		const { formattedSlots, formattedExceptions } = this.state;

		return (
			<div class={styles.cells}>
				{TIMES.map((time, i) => {
					const [y, m, d] = Day._correctDateByDay(day, i);

					if (slotExists(formattedSlots, y, m, d))
						return this._renderSlot(y, m, d);

					if (slotExists(formattedExceptions, y, m, d))
						return this._renderException(y, m, d);

					return null;
				})}
			</div>
		);
	}

	_renderSlot (y, m, d) {
		const { formattedSlots } = this.state;

		return formattedSlots[y][m][d].map(id => {
			const slot = formattedSlots[y][m].all[id]
				, cls = [styles.slot];

			if (slot.splitLeft)
				cls.push(styles["split-left"]);

			if (slot.splitRight)
				cls.push(styles["split-right"]);

			return (
				<span
					key={id}
					style={slot.position}
					class={cls.join(" ")}
				>
					<span>
						Bookable
						<em>{this._getDuration(slot)}</em>
					</span>
				</span>
			);
		});
	}

	_renderException (y, m, d) {
		const { formattedExceptions } = this.state;

		return formattedExceptions[y][m][d].map(id => {
			const slot = formattedExceptions[y][m].all[id];

			return (
				<span
					key={id}
					style={slot.position}
					class={styles.exception}
				/>
			);
		});
	}

	// Helpers
	// =========================================================================

	static _computeDays (props) {
		const startDate = getFirstSlot(
			props.slots,
			{ date: new Date() }
		).date;

		const firstDay = {
			year: startDate.getFullYear(),
			month: startDate.getMonth() + 1,
			day: startDate.getDate(),
		};

		const days = [firstDay];

		// TODO: Make i dynamic (see Week.js for details)
		let i = 3,
			prevDay = firstDay;

		while (--i) {
			const [year, month, day] = correctDate(
				prevDay.year,
				prevDay.month,
				prevDay.day + 1
			);

			const d = { year, month, day };

			days.push(d);
			prevDay = d;
		}

		return days;
	}

	_formatSlots (slots) {
		// Un-freeze the slots object (only an issue in dev)
		if (process.env.NODE_ENV === "development")
			slots = JSON.parse(JSON.stringify(slots));

		slots = { ...slots };

		for (let y in slots) {
			if (!slots.hasOwnProperty(y))
				continue;

			for (let m in slots[y]) {
				if (!slots[y].hasOwnProperty(m))
					continue;

				for (let key in slots[y][m].all) {
					if (!slots[y][m].all.hasOwnProperty(key))
						continue;

					slots = this._formatSlot(y, m, key, slots);
				}
			}
		}

		return slots;
	}

	_formatSlot (y, m, key, slots) {
		const slot = slots[y][m].all[key];

		const fullWidth = this.props.baseRule.duration;
		const widthInclStartOffset = fullWidth + slot.minute;

		// If it won't overflow, set position & continue
		if (widthInclStartOffset <= 60) {
			slots[y][m].all[key] = {
				...slot,
				position: this._getPosition(slot.hour, slot.minute),
			};
			return slots;
		}

		// 1. Set the position of the original chunk
		slots[y][m].all[key] = {
			...slot,
			position: this._getPosition(
				slot.hour,
				slot.minute,
				fullWidth + (60 - widthInclStartOffset)
			),
			splitRight: true,
		};

		// 2. Add additional chunks

		// Calculate how many extra hours & minutes (chunks) this slot overflows by
		const extraPartialChunkWidth = widthInclStartOffset % 60;
		let extraWholeChunks = Math.floor(widthInclStartOffset / 60),
			prevDate = slot.date,
			prevHour = slot.date.getHours();

		if (widthInclStartOffset === 120)
			--extraWholeChunks;

		while (--extraWholeChunks) {
			const nDate = new Date(
				prevDate.getFullYear(),
				prevDate.getMonth(),
				prevDate.getDate(),
				prevHour + 1,
				0, 0, 0
			);
			const nKey = nDate.getTime();

			const ny = nDate.getFullYear()
				, nm = nDate.getMonth() + 1
				, nd = nDate.getDate();

			if (!slots.hasOwnProperty(ny))
				slots[ny] = {};

			if (!slots[ny].hasOwnProperty(nm))
				slots[ny][nm] = { all: {} };

			if (!slots[ny][nm].hasOwnProperty(nd))
				slots[ny][nm][nd] = [];

			const isPartial = extraWholeChunks === 0 && extraPartialChunkWidth > 0;

			slots[ny][nm].all[nKey] = {
				...slot,
				position: this._getPosition(
					nDate.getHours(),
					0,
					isPartial ? extraPartialChunkWidth : 60
				),
				splitLeft: true,
				splitRight: extraWholeChunks !== 0,
			};

			if (slot[ny][nm][nd].indexOf(nKey) === -1)
				slot[ny][nm][nd].push(nKey);

			prevDate = nDate;
			prevHour = nDate.getHours();
		}

		return slots;
	}

	_getPosition (hour, minutes, duration = this.props.baseRule.duration) {
		return {
			top: (hour * 60) + "px",
			left: ((minutes / 60) * 100) + "%",
			// This assumes frequency === Minutely, view should be
			// disabled for other frequencies
			width: ((duration / 60) * 100) + "%",
		};
	}

	static _correctDateByDay (day, i) {
		return correctDate(
			day.year,
			day.month,
			day.day + i
		);
	}

	static _getHeader (day) {
		const [, m, d] = Day._correctDateByDay(day, 0);
		return d + " " + MONTHS[m - 1];
	}

	_getDuration (slot) {
		const h = slot.hour === 24 ? 0 : slot.hour;

		const from = padZero(h) + ":" + padZero(slot.minute);

		let min = slot.minute + this.props.baseRule.duration,
			hr = slot.hour;

		if (min >= 60) {
			min -= 60;
			hr += 1;
		}

		if (hr >= 24)
			hr -= 24;

		let to = padZero(hr) + ":" + padZero(min);

		return from + " - " + to;
	}

}

export default connect(({ settings: { baseRule }, slots, exceptions }) => ({
	baseRule,
	slots,
	exceptions,
}))(Day);