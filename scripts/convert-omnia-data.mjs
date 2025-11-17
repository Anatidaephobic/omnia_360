import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CSV_PATH = resolve(__dirname, "../app/Omnia Data.csv");

const csvContent = await readFile(CSV_PATH, "utf8");

const lines = csvContent
	.split(/\r?\n/)
	.map((line) => line.trim())
	.filter((line) => line.length > 0);

if (lines.length < 2) {
	throw new Error("CSV is missing data rows.");
}

const stripDiacritics = (label) =>
	label.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const toCamelCase = (label) => {
	const words = stripDiacritics(label).toLowerCase().match(/[a-z0-9]+/g);

	if (!words || words.length === 0) {
		return label.trim();
	}

	return words
		.slice(1)
		.reduce(
			(result, word) => result + word[0].toUpperCase() + word.slice(1),
			words[0],
		);
};

const normalisedHeaders = lines[0]
	.split(",")
	.map((header) => toCamelCase(header.trim()));

const reports = lines.slice(1).map((line) => {
	const values = line.split(",").map((value) => value.trim());

	return normalisedHeaders.reduce((entry, header, index) => {
		const rawValue = values[index] ?? "";

		if (rawValue === "") {
			entry[header] = rawValue;
			return entry;
		}

		if (index === 0) {
			const [, month = "", day = "", year = ""] =
				rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) ?? [];

			if (year && month && day) {
				entry[header] = `${year}-${month.padStart(2, "0")}-${day.padStart(
					2,
					"0",
				)}`;
				return entry;
			}

			const dateValue = new Date(rawValue);

			entry[header] = Number.isNaN(dateValue.getTime())
				? rawValue
				: dateValue.toISOString();
			return entry;
		}

		const numericValue = Number(rawValue.replace(",", "."));

		entry[header] = Number.isFinite(numericValue) ? numericValue : rawValue;
		return entry;
	}, {});
});

console.log(JSON.stringify(reports, null, 2));

