import * as React from "react"
import {
  IconArrowDownRight,
  IconArrowUpRight,
} from "@tabler/icons-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { AppSidebar } from "~/components/app-sidebar"
import { SiteHeader } from "~/components/site-header"
import { useIsMobile } from "~/hooks/use-mobile"
import {
  SidebarInset,
  SidebarProvider,
} from "~/components/ui/sidebar"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "~/components/ui/toggle-group"

import healthData from "../data.json"

type HealthSample = {
  dataHora: string
  batimentosMediaBpm: number
  batimentosMinBpm: number
  batimentosMaxBpm: number
  oximetriaSpo: number
  spoMin: number
  spoMax: number
  passos: number
  sonoMin: number
  scoreSono1100: number
  stress0100: number
  caloriasKcal: number
}

type NumericHealthKey = keyof Pick<
  HealthSample,
  | "batimentosMediaBpm"
  | "batimentosMinBpm"
  | "batimentosMaxBpm"
  | "oximetriaSpo"
  | "spoMin"
  | "spoMax"
  | "passos"
  | "sonoMin"
  | "scoreSono1100"
  | "stress0100"
  | "caloriasKcal"
>

type FocusAxis = "left" | "right"

type FocusDomain =
  | {
      min?: number
      max?: number
    }
  | ((
      samples: HealthSample[],
      axisKeys: NumericHealthKey[]
    ) => [number, number])

type FocusMetricKey = {
  key: NumericHealthKey
  label: string
  color: string
  axis?: FocusAxis
}

const orderedSamples: HealthSample[] = [
  ...(healthData as HealthSample[]),
].sort(
  (a, b) =>
    new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()
)

const timeframeDays = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
} as const

type Timeframe = keyof typeof timeframeDays

const focusModes = ["sleep", "stress", "heart-rate", "oxygenation"] as const
type FocusMode = (typeof focusModes)[number]

type FocusMetricConfig = {
  label: string
  description: string
  unit?: string
  precision?: number
  spotlightKey: NumericHealthKey
  keys: FocusMetricKey[]
  domains?: Partial<Record<FocusAxis, FocusDomain>>
  axisFormatter?: Partial<Record<FocusAxis, (value: number) => string>>
  formatter?: (value: number) => string
  secondarySpotlightKey?: NumericHealthKey
  secondaryLabel?: string
  secondaryUnit?: string
  secondaryPrecision?: number
  secondaryFormatter?: (value: number) => string
}

type MetricSummary = {
  latest: number | null
  change: number | null
  average: number | null
}

type FocusSummary = {
  primary: MetricSummary
  secondary?: MetricSummary
}

function buildDynamicDomain({
  padding = 10,
  floor = Number.NEGATIVE_INFINITY,
  ceil = Number.POSITIVE_INFINITY,
}: {
  padding?: number
  floor?: number
  ceil?: number
}) {
  return (
    samples: HealthSample[],
    axisKeys: NumericHealthKey[]
  ): [number, number] => {
    if (!samples.length || !axisKeys.length) {
      return [0, 0]
    }

    const values = samples.flatMap((sample) =>
      axisKeys.map((key) => sample[key])
    )
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return [0, 0]
    }

    const dynamicPadding = Math.max(padding, (maxValue - minValue) * 0.05)

    return [
      Math.max(floor, minValue - dynamicPadding),
      Math.min(ceil, maxValue + dynamicPadding),
    ]
  }
}

function collectAxisValues(
  samples: HealthSample[],
  axisKeys: NumericHealthKey[]
) {
  return samples.flatMap((sample) => axisKeys.map((key) => sample[key]))
}

function resolveAxisDomain(
  axis: FocusAxis,
  config: FocusMetricConfig,
  samples: HealthSample[],
  axisKeys: NumericHealthKey[]
): [number, number] {
  const domainConfig = config.domains?.[axis]

  if (typeof domainConfig === "function") {
    return domainConfig(samples, axisKeys)
  }

  const values = collectAxisValues(samples, axisKeys)

  if (!values.length) {
    return [0, 0]
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = Math.max(1, (maxValue - minValue) * 0.1 || 5)

  return [
    domainConfig?.min ?? minValue - padding,
    domainConfig?.max ?? maxValue + padding,
  ]
}

const focusMetricConfig: Record<FocusMode, FocusMetricConfig> = {
  sleep: {
    label: "Qualidade do sono",
    description: "Minutos dormidos junto com pontuação de recuperação noturna.",
    unit: "min",
    spotlightKey: "sonoMin",
    formatter: formatSleepDuration,
    secondarySpotlightKey: "scoreSono1100",
    secondaryLabel: "Pontuação do sono",
    secondaryUnit: "pts",
    secondaryPrecision: 0,
    keys: [
      {
        key: "sonoMin",
        label: "Minutos de sono",
        color: "var(--color-chart-1)",
        axis: "left",
      },
      {
        key: "scoreSono1100",
        label: "Pontuação do sono",
        color: "var(--color-chart-3)",
        axis: "right",
      },
    ],
    domains: {
      left: buildDynamicDomain({ padding: 20, floor: 240, ceil: 600 }),
      right: { min: 0, max: 100 },
    },
    axisFormatter: {
      left: (value) => `${Math.round(value / 60)}h`,
      right: (value) => `${value.toFixed(0)}`,
    },
  },
  stress: {
    label: "Prontidão ao estresse",
    description: "Pontuação diária de estresse na janela selecionada.",
    unit: "pts",
    spotlightKey: "stress0100",
    keys: [
      {
        key: "stress0100",
        label: "Pontuação de estresse",
        color: "var(--color-chart-2)",
      },
    ],
    domains: {
      left: { min: 0, max: 100 },
    },
    axisFormatter: {
      left: (value) => `${value.toFixed(0)}`,
    },
  },
  "heart-rate": {
    label: "Detalhes da frequência cardíaca",
    description:
      "Acompanhe valores mín/méd/máx da frequência cardíaca para identificar tendências de recuperação.",
    unit: "bpm",
    spotlightKey: "batimentosMediaBpm",
    keys: [
      {
        key: "batimentosMinBpm",
        label: "Mín bpm",
        color: "var(--color-chart-2)",
      },
      {
        key: "batimentosMediaBpm",
        label: "Méd bpm",
        color: "var(--color-chart-1)",
      },
      {
        key: "batimentosMaxBpm",
        label: "Máx bpm",
        color: "var(--color-chart-3)",
      },
    ],
    domains: {
      left: { min: 50, max: 110 },
    },
    axisFormatter: {
      left: (value) => `${value.toFixed(0)}`,
    },
  },
  oxygenation: {
    label: "Detalhes da oxigenação",
    description: "Monitore a estabilidade do SpO₂ e identifique quedas rapidamente.",
    unit: "%",
    precision: 1,
    spotlightKey: "oximetriaSpo",
    formatter: (value: number) =>
      `${value.toFixed(1)} %`,
    keys: [
      {
        key: "spoMin",
        label: "Mín SpO₂",
        color: "var(--color-chart-3)",
      },
      {
        key: "oximetriaSpo",
        label: "Média SpO₂",
        color: "var(--color-chart-1)",
      },
      {
        key: "spoMax",
        label: "Máx SpO₂",
        color: "var(--color-chart-2)",
      },
    ],
    domains: {
      left: { min: 92, max: 100 },
    },
    axisFormatter: {
      left: (value) => `${value.toFixed(1)}%`,
    },
  },
}

const stepsCaloriesChartConfig: ChartConfig = {
  passos: {
    label: "Passos",
    color: "var(--color-chart-4)",
  },
  caloriasKcal: {
    label: "Calorias",
    color: "var(--color-chart-5)",
  },
}

const timeframeOptions: { label: string; value: Timeframe }[] = [
  { label: "Últimos 7 dias", value: "7d" },
  { label: "Últimos 14 dias", value: "14d" },
  { label: "Últimos 30 dias", value: "30d" },
]

const numberFormatter = new Intl.NumberFormat("en-US")
const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

function formatSleepDuration(minutes?: number | null) {
  if (
    minutes === undefined ||
    minutes === null ||
    Number.isNaN(minutes)
  ) {
    return "—"
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins.toString().padStart(2, "0")}m`
}

function formatMetricValue(
  value: number | null,
  config: {
    unit?: string
    precision?: number
    formatter?: (value: number) => string
  }
) {
  if (value === null || Number.isNaN(value)) {
    return "—"
  }
  if (config.formatter) {
    return config.formatter(value)
  }
  if (typeof config.precision === "number") {
    return `${value.toFixed(config.precision)}${
      config.unit ? ` ${config.unit}` : ""
    }`
  }
  return `${value.toLocaleString("en-US")}${
    config.unit ? ` ${config.unit}` : ""
  }`
}

const formatDeltaLabel = (delta: number, unit?: string) => {
  const absolute = Math.abs(delta)
  if (unit === "%") {
    return `${absolute.toFixed(1)}%`
  }
  if (unit === "bpm") {
    return `${absolute.toFixed(0)} bpm`
  }
  if (unit === "pts") {
    return `${absolute.toFixed(0)} pts`
  }
  return `${absolute.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`
}

export default function Page() {
  const [focusMode, setFocusMode] =
    React.useState<FocusMode>("sleep")
  const [timeframe, setTimeframe] =
    React.useState<Timeframe>("14d")
  const isMobile = useIsMobile()

  const latestEntry =
    orderedSamples[orderedSamples.length - 1] ?? null
  const previousEntry =
    orderedSamples[orderedSamples.length - 2] ?? null

  const filteredSamples = React.useMemo(() => {
    if (!orderedSamples.length) {
      return []
    }
    const days = timeframeDays[timeframe]
    const endDate = new Date(
      orderedSamples[orderedSamples.length - 1].dataHora
    )
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (days - 1))
    return orderedSamples.filter((sample) => {
      const sampleDate = new Date(sample.dataHora)
      return sampleDate >= startDate && sampleDate <= endDate
    })
  }, [timeframe])

  const focusConfig = focusMetricConfig[focusMode]

  const axisKeyMap = React.useMemo(
    () =>
      focusConfig.keys.reduce<
        Partial<Record<FocusAxis, NumericHealthKey[]>>
      >((acc, item) => {
        const axis = item.axis ?? "left"
        acc[axis] = [...(acc[axis] ?? []), item.key]
        return acc
      }, {}),
    [focusConfig]
  )

  const axes = React.useMemo<FocusAxis[]>(() => {
    const currentAxes = Object.keys(axisKeyMap) as FocusAxis[]
    return currentAxes.length
      ? currentAxes
      : (["left"] as FocusAxis[])
  }, [axisKeyMap])

  const axisDomains = React.useMemo(() => {
    const domains: Partial<Record<FocusAxis, [number, number]>> = {}
    axes.forEach((axis) => {
      const axisKeys = axisKeyMap[axis]
      if (axisKeys?.length) {
        domains[axis] = resolveAxisDomain(
          axis,
          focusConfig,
          filteredSamples,
          axisKeys
        )
      }
    })
    return domains
  }, [axes, axisKeyMap, focusConfig, filteredSamples])

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {}
    focusConfig.keys.forEach((item) => {
      config[item.key] = {
        label: item.label,
        color: item.color,
      }
    })
    return config
  }, [focusConfig])

  const chartData = React.useMemo(() => {
    return filteredSamples.map((sample) => {
      const entry: Record<string, string | number> = {
        date: sample.dataHora,
      }
      focusConfig.keys.forEach((series) => {
        entry[series.key] = sample[series.key]
      })
      return entry
    })
  }, [filteredSamples, focusConfig])

  const buildMetricSummary = React.useCallback(
    (key: NumericHealthKey): MetricSummary => {
      if (!filteredSamples.length) {
        return {
          latest: null,
          change: null,
          average: null,
        }
      }
      const latestValue =
        filteredSamples[filteredSamples.length - 1][key]
      const firstValue = filteredSamples[0][key]
      const sum = filteredSamples.reduce(
        (total, sample) => total + sample[key],
        0
      )
      const averageValue = sum / filteredSamples.length
      return {
        latest: Number.isFinite(latestValue) ? latestValue : null,
        change:
          filteredSamples.length > 1 &&
          Number.isFinite(latestValue) &&
          Number.isFinite(firstValue)
            ? latestValue - firstValue
            : null,
        average: Number.isFinite(averageValue) ? Math.round(averageValue) : null,
      }
    },
    [filteredSamples]
  )

  const focusSummary = React.useMemo<FocusSummary | null>(() => {
    if (!filteredSamples.length) {
      return null
    }
    const summary: FocusSummary = {
      primary: buildMetricSummary(focusConfig.spotlightKey),
    }
    if (focusConfig.secondarySpotlightKey) {
      summary.secondary = buildMetricSummary(
        focusConfig.secondarySpotlightKey
      )
    }
    return summary
  }, [buildMetricSummary, filteredSamples, focusConfig])

  const stepsCaloriesData = React.useMemo(() => {
    return filteredSamples.map((sample) => ({
      date: sample.dataHora,
      passos: sample.passos,
      caloriasKcal: sample.caloriasKcal,
    }))
  }, [filteredSamples])

  const stepsCaloriesDomains = React.useMemo(() => {
    if (!filteredSamples.length) {
      return {
        left: undefined,
        right: undefined,
      }
    }
    const stepsValues = filteredSamples.map((sample) => sample.passos)
    const caloriesValues = filteredSamples.map(
      (sample) => sample.caloriasKcal
    )
    const range = (
      values: number[],
      padding: number
    ): [number, number] | undefined => {
      if (!values.length) {
        return undefined
      }
      const min = Math.min(...values)
      const max = Math.max(...values)
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return undefined
      }
      return [
        Math.max(0, min - padding),
        max + padding,
      ] as [number, number]
    }
    return {
      left: range(stepsValues, 500),
      right: range(caloriesValues, 100),
    }
  }, [filteredSamples])

  const averageSteps =
    orderedSamples.length > 0
      ? Math.round(
          orderedSamples.reduce(
            (total, sample) => total + sample.passos,
            0
          ) / orderedSamples.length
        )
      : 0
  const averageSleepMinutes =
    orderedSamples.length > 0
      ? Math.round(
          orderedSamples.reduce(
            (total, sample) => total + sample.sonoMin,
            0
          ) / orderedSamples.length
        )
      : 0

  const summaryCards = [
    {
      id: "heart-rate",
      title: "Frequência cardíaca média",
      value: latestEntry
        ? `${latestEntry.batimentosMediaBpm} bpm`
        : "—",
      helper: latestEntry
        ? `Faixa ${latestEntry.batimentosMinBpm} – ${latestEntry.batimentosMaxBpm} bpm`
        : "Aguardando sincronização do dispositivo",
      delta:
        latestEntry && previousEntry
          ? latestEntry.batimentosMediaBpm -
            previousEntry.batimentosMediaBpm
          : null,
      unit: "bpm",
    },
    {
      id: "oxygenation",
      title: "Oxigenação do sangue",
      value: latestEntry
        ? `${percentFormatter.format(
            latestEntry.oximetriaSpo
          )}%`
        : "—",
      helper: latestEntry
        ? `Mín ${latestEntry.spoMin.toFixed(
            1
          )}% • Máx ${latestEntry.spoMax.toFixed(1)}%`
        : "Aguardando sincronização do dispositivo",
      delta:
        latestEntry && previousEntry
          ? latestEntry.oximetriaSpo -
            previousEntry.oximetriaSpo
          : null,
      unit: "%",
    },
    {
      id: "steps",
      title: "Passos diários (média)",
      value:
        averageSteps > 0
          ? `${numberFormatter.format(averageSteps)}`
          : "—",
      helper: `Ao longo de ${orderedSamples.length} dias registrados`,
      delta: null,
      unit: "passos",
    },
    {
      id: "sleep",
      title: "Duração do sono",
      value: latestEntry
        ? formatSleepDuration(latestEntry.sonoMin)
        : "—",
      helper: `Média ${formatSleepDuration(averageSleepMinutes)}`,
      delta: null,
      unit: "minutos",
    },
  ]

  const activeRangeLabel = filteredSamples.length
    ? `${formatDateLabel(filteredSamples[0].dataHora)} – ${formatDateLabel(
        filteredSamples[filteredSamples.length - 1].dataHora
      )}`
    : "Sem dados"

  const timeframeLabel =
    timeframeOptions.find((option) => option.value === timeframe)
      ?.label || "—"

  const secondaryFormat = {
    unit: focusConfig.secondaryUnit,
    precision: focusConfig.secondaryPrecision,
    formatter: focusConfig.secondaryFormatter,
  }

  const primaryChangeFormat = {
    unit: focusConfig.unit,
    precision: focusConfig.precision,
  }

  const secondaryChangeFormat = {
    unit: focusConfig.secondaryUnit,
    precision: focusConfig.secondaryPrecision,
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="flex flex-col gap-2 px-4 lg:px-6">
                <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Omnia 360 · Insights de saúde
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Painel de desempenho diário
                </h1>
                <p className="text-muted-foreground text-base">
                  Visão geral de alto nível com alternadores dedicados para tendências de sono,
                  estresse, frequência cardíaca e oxigenação.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 px-4 *:shadow-xs md:grid-cols-2 lg:px-6">
                {summaryCards.map((card) => (
                  <Card key={card.id} className="@container/card">
                    <CardHeader>
                      <CardDescription>
                        {card.title}
                      </CardDescription>
                      <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                        {card.value}
                      </CardTitle>
                      {card.delta !== null && (
                        <CardAction>
                          <Badge
                            variant="outline"
                            className={`gap-1 text-xs font-semibold ${
                              card.delta >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {card.delta >= 0 ? (
                              <IconArrowUpRight className="size-4" />
                            ) : (
                              <IconArrowDownRight className="size-4" />
                            )}
                            {formatDeltaLabel(
                              card.delta,
                              card.unit
                            )}{" "}
                            vs dia anterior
                          </Badge>
                        </CardAction>
                      )}
                    </CardHeader>
                    <CardFooter className="flex-col items-start gap-1.5 text-sm text-muted-foreground">
                      {card.helper}
                    </CardFooter>
                  </Card>
                ))}
              </div>

              <div className="px-0 lg:px-6">
                {isMobile && (
                  <div className="flex gap-2 px-4 pb-2">
                    <Select
                      value={focusMode}
                      onValueChange={(value) => {
                        if (value) {
                          setFocusMode(value as FocusMode)
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="flex-1"
                        aria-label="Selecionar visualização"
                      >
                        <SelectValue placeholder="Visualização" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="sleep" className="rounded-lg">
                          Sono
                        </SelectItem>
                        <SelectItem value="stress" className="rounded-lg">
                          Estresse
                        </SelectItem>
                        <SelectItem value="heart-rate" className="rounded-lg">
                          Frequência cardíaca
                        </SelectItem>
                        <SelectItem value="oxygenation" className="rounded-lg">
                          Oxigenação
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={timeframe}
                      onValueChange={(value) =>
                        setTimeframe(value as Timeframe)
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32"
                        aria-label="Selecionar período"
                      >
                        <SelectValue placeholder="Período" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {timeframeOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="rounded-lg"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Card className={`@container/card ${isMobile ? "border-0 shadow-none" : ""}`}>
                  <CardHeader className={isMobile ? "hidden" : ""}>
                    <div className="flex flex-col gap-2">
                      <CardDescription>
                        {activeRangeLabel}
                      </CardDescription>
                      <CardTitle className="text-2xl font-semibold overflow-visible">
                        {focusConfig.label}
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        {focusConfig.description}
                      </p>
                    </div>
                    <CardAction className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <ToggleGroup
                        type="single"
                        value={focusMode}
                        onValueChange={(value) => {
                          if (value) {
                            setFocusMode(value as FocusMode)
                          }
                        }}
                        variant="outline"
                        className="*:data-[slot=toggle-group-item]:px-4!"
                      >
                        <ToggleGroupItem value="sleep">
                          Sono
                        </ToggleGroupItem>
                        <ToggleGroupItem value="stress">
                          Estresse
                        </ToggleGroupItem>
                        <ToggleGroupItem value="heart-rate">
                          Frequência cardíaca
                        </ToggleGroupItem>
                        <ToggleGroupItem value="oxygenation">
                          Oxigenação
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <Select
                        value={timeframe}
                        onValueChange={(value) =>
                          setTimeframe(value as Timeframe)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-40"
                          aria-label="Selecionar período"
                        >
                          <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {timeframeOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="rounded-lg"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardAction>
                  </CardHeader>
                  <CardContent className={isMobile ? "px-0 pt-0" : "px-2 pt-4 sm:px-6 sm:pt-6"}>
                    <ChartContainer
                      config={chartConfig}
                      className={`aspect-auto w-full ${isMobile ? "h-[240px]" : "h-[280px]"}`}
                    >
                      <AreaChart data={chartData}>
                        <defs>
                          {focusConfig.keys.map((series) => (
                            <linearGradient
                              key={series.key}
                              id={`fill-${series.key}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor={`var(--color-${series.key})`}
                                stopOpacity={0.8}
                              />
                              <stop
                                offset="95%"
                                stopColor={`var(--color-${series.key})`}
                                stopOpacity={0.05}
                              />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={isMobile ? 4 : 8}
                          minTickGap={isMobile ? 40 : 24}
                          tick={!isMobile}
                          tickFormatter={formatDateLabel}
                        />
                        {axes.map((axis) => (
                          <YAxis
                            key={axis}
                            yAxisId={axis}
                            orientation={axis === "right" ? "right" : "left"}
                            axisLine={false}
                            tickLine={false}
                            {...(isMobile ? { width: 35 } : {})}
                            tick={!isMobile}
                            domain={
                              (axisDomains[axis] ??
                                ["auto", "auto"]) as [
                                number | "auto",
                                number | "auto",
                              ]
                            }
                            tickFormatter={
                              focusConfig.axisFormatter?.[axis]
                            }
                          />
                        ))}
                        <ChartTooltip
                          cursor={{ strokeOpacity: 0.2 }}
                          content={
                            <ChartTooltipContent
                              labelFormatter={(value) =>
                                formatDateLabel(value as string)
                              }
                            />
                          }
                        />
                        {focusConfig.keys.map((series) => (
                          <Area
                            key={series.key}
                            dataKey={series.key}
                            yAxisId={series.axis ?? "left"}
                            type="monotone"
                            fill={`url(#fill-${series.key})`}
                            stroke={`var(--color-${series.key})`}
                            strokeWidth={2}
                          />
                        ))}
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                  <CardFooter className={isMobile ? "hidden" : "flex flex-wrap gap-6 text-sm text-muted-foreground"}>
                    <div>
                      <p className="text-xs uppercase tracking-wide">
                        Mais recente
                      </p>
                      <p className="text-foreground text-base font-semibold">
                        {focusSummary
                          ? formatMetricValue(
                              focusSummary.primary.latest,
                              focusConfig
                            )
                          : "—"}
                      </p>
                      {focusSummary &&
                        focusSummary.primary.change !== null && (
                        <span
                          className={`flex items-center gap-1 text-xs ${
                            focusSummary.primary.change >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {focusSummary.primary.change >= 0 ? (
                            <IconArrowUpRight className="size-3.5" />
                          ) : (
                            <IconArrowDownRight className="size-3.5" />
                          )}
                          {formatMetricValue(
                            focusSummary.primary.change,
                            primaryChangeFormat
                          )}{" "}
                          vs início do período
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide">
                        Média móvel
                      </p>
                      <p className="text-foreground text-base font-semibold">
                        {focusSummary
                          ? formatMetricValue(
                              focusSummary.primary.average,
                              focusConfig
                            )
                          : "—"}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {timeframeLabel}
                      </span>
                    </div>
                      {focusSummary?.secondary && (
                      <div>
                        <p className="text-xs uppercase tracking-wide">
                          {focusConfig.secondaryLabel || "Secundário"}
                        </p>
                        <p className="text-foreground text-base font-semibold">
                          {formatMetricValue(
                            focusSummary.secondary.latest,
                            secondaryFormat
                          )}
                        </p>
                        {focusSummary.secondary.change !== null && (
                          <span
                            className={`flex items-center gap-1 text-xs ${
                              focusSummary.secondary.change >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {focusSummary.secondary.change >= 0 ? (
                              <IconArrowUpRight className="size-3.5" />
                            ) : (
                              <IconArrowDownRight className="size-3.5" />
                            )}
                            {formatMetricValue(
                              focusSummary.secondary.change,
                              secondaryChangeFormat
                            )}{" "}
                            vs início do período
                          </span>
                        )}
                      </div>
                    )}
                  </CardFooter>
                </Card>
              </div>
              <div className="px-0 lg:px-6">
                <Card className={`@container/card ${isMobile ? "border-0 shadow-none" : ""}`}>
                  <CardHeader className={isMobile ? "hidden" : ""}>
                    <CardDescription>
                      {activeRangeLabel}
                    </CardDescription>
                    <CardTitle className="text-2xl font-semibold overflow-visible">
                      Passos e calorias
                    </CardTitle>
                    <p className="text-muted-foreground text-sm">
                      Compare volume de movimento com queima total de energia para a janela selecionada.
                    </p>
                  </CardHeader>
                  <CardContent className={isMobile ? "px-0 pt-0" : "px-2 pt-4 sm:px-6 sm:pt-6"}>
                    <ChartContainer
                      config={stepsCaloriesChartConfig}
                      className={`aspect-auto w-full ${isMobile ? "h-[240px]" : "h-[260px]"}`}
                    >
                      <AreaChart data={stepsCaloriesData}>
                        <defs>
                          <linearGradient
                            id="fill-passos"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-passos)"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-passos)"
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                          <linearGradient
                            id="fill-caloriasKcal"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-caloriasKcal)"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-caloriasKcal)"
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={isMobile ? 4 : 8}
                          minTickGap={isMobile ? 40 : 24}
                          tick={!isMobile}
                          tickFormatter={formatDateLabel}
                        />
                        <YAxis
                          yAxisId="left"
                          axisLine={false}
                          tickLine={false}
                          {...(isMobile ? { width: 35 } : {})}
                          tick={!isMobile}
                          domain={
                            (stepsCaloriesDomains.left ??
                              ["auto", "auto"]) as [
                              number | "auto",
                              number | "auto",
                            ]
                          }
                          tickFormatter={(value) =>
                            numberFormatter.format(Number(value))
                          }
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          axisLine={false}
                          tickLine={false}
                          {...(isMobile ? { width: 40 } : {})}
                          tick={!isMobile}
                          domain={
                            (stepsCaloriesDomains.right ??
                              ["auto", "auto"]) as [
                              number | "auto",
                              number | "auto",
                            ]
                          }
                          tickFormatter={(value) =>
                            `${Math.round(Number(value))}kcal`
                          }
                        />
                        <ChartTooltip
                          cursor={{ strokeOpacity: 0.2 }}
                          content={
                            <ChartTooltipContent
                              labelFormatter={(value) =>
                                formatDateLabel(value as string)
                              }
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="passos"
                          yAxisId="left"
                          fill="url(#fill-passos)"
                          stroke="var(--color-passos)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="caloriasKcal"
                          yAxisId="right"
                          fill="url(#fill-caloriasKcal)"
                          stroke="var(--color-caloriasKcal)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
