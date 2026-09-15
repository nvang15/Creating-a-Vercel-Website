"use client"

/* eslint-disable @next/next/no-img-element */

export const dynamic = "force-dynamic"

import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Crown,
  Gauge,
  LoaderCircle,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Swords,
  X,
  Zap,
} from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/supabase"

type PokemonRow = {
  Num: number
  Name: string
  Type1: string
  Type2: string | null
  HP: number
  Attack: number
  Defense: number
  SpAtk: number
  SpDef: number
  Speed: number
  Generation: number
  Legendary: boolean
}

type SortKey =
  | "Num"
  | "Name"
  | "HP"
  | "Attack"
  | "Defense"
  | "SpAtk"
  | "SpDef"
  | "Speed"
  | "Total"
  | "Generation"

type SortDirection = "asc" | "desc"
type LegendaryFilter = "all" | "legendary" | "non-legendary"

type PredictorInput = {
  Type1: string
  Type2: string
  HP: number
  Attack: number
  Defense: number
  SpAtk: number
  SpDef: number
  Speed: number
  Generation: number
}

type PredictionResult = {
  prediction: string
  is_legendary: boolean
  legendary_probability: number
  non_legendary_probability: number
}

const statColumns = [
  "HP",
  "Attack",
  "Defense",
  "SpAtk",
  "SpDef",
  "Speed",
] as const

const sortableColumns: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "Num", label: "#" },
  { key: "Name", label: "Name" },
  { key: "HP", label: "HP", align: "right" },
  { key: "Attack", label: "Attack", align: "right" },
  { key: "Defense", label: "Defense", align: "right" },
  { key: "SpAtk", label: "Sp. Atk", align: "right" },
  { key: "SpDef", label: "Sp. Def", align: "right" },
  { key: "Speed", label: "Speed", align: "right" },
  { key: "Total", label: "Total", align: "right" },
  { key: "Generation", label: "Gen", align: "right" },
]

const typeColors: Record<string, string> = {
  Normal: "#A8A878",
  Fire: "#F08030",
  Water: "#6890F0",
  Grass: "#78C850",
  Electric: "#F8D030",
  Ice: "#98D8D8",
  Fighting: "#C03028",
  Poison: "#A040A0",
  Ground: "#E0C068",
  Flying: "#A890F0",
  Psychic: "#F85888",
  Bug: "#A8B820",
  Rock: "#B8A038",
  Ghost: "#705898",
  Dragon: "#7038F8",
  Dark: "#705848",
  Steel: "#B8B8D0",
  Fairy: "#EE99AC",
}

const defaultPredictorInput: PredictorInput = {
  Type1: "",
  Type2: "",
  HP: 80,
  Attack: 80,
  Defense: 80,
  SpAtk: 80,
  SpDef: 80,
  Speed: 80,
  Generation: 1,
}

const predictorGenerations = Array.from({ length: 9 }, (_, index) => index + 1)

const predictorStatFields: {
  key: keyof Pick<
    PredictorInput,
    "HP" | "Attack" | "Defense" | "SpAtk" | "SpDef" | "Speed"
  >
  label: string
}[] = [
  { key: "HP", label: "HP" },
  { key: "Attack", label: "Attack" },
  { key: "Defense", label: "Defense" },
  { key: "SpAtk", label: "Sp. Attack" },
  { key: "SpDef", label: "Sp. Defense" },
  { key: "Speed", label: "Speed" },
]

function getBaseStatTotal(pokemon: PokemonRow) {
  return statColumns.reduce((total, stat) => total + pokemon[stat], 0)
}

function getComparableValue(pokemon: PokemonRow, key: SortKey) {
  if (key === "Total") {
    return getBaseStatTotal(pokemon)
  }

  return pokemon[key]
}

const spriteNameOverrides: Record<string, string> = {
  "Farfetch'd": "farfetchd",
  "Mr. Mime": "mr-mime",
  "Mime Jr.": "mime-jr",
  "Nidoran♀": "nidoran-f",
  "Nidoran♂": "nidoran-m",
}

function toSpriteSlug(name: string) {
  const override = spriteNameOverrides[name]

  if (override) {
    return override
  }

  const spacedName = name.replace(/([a-z])([A-Z])/g, "$1 $2")
  const megaMatch = spacedName.match(/Mega\s+(.+?)(?:\s+([XY]))?$/)

  if (megaMatch) {
    const baseName = megaMatch[1]
    const megaSuffix = megaMatch[2] ? `-mega-${megaMatch[2].toLowerCase()}` : "-mega"

    return `${slugifyPokemonName(baseName)}${megaSuffix}`
  }

  const primalMatch = spacedName.match(/Primal\s+(.+)$/)

  if (primalMatch) {
    return `${slugifyPokemonName(primalMatch[1])}-primal`
  }

  return slugifyPokemonName(spacedName.replace(/\s+(Altered|Incarnate|Land|Normal)\s+Forme$/i, ""))
}

function slugifyPokemonName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[♀]/g, "-f")
    .replace(/[♂]/g, "-m")
    .replace(/[':.]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

function getSpriteUrl(name: string) {
  return `https://img.pokemondb.net/sprites/home/normal/${toSpriteSlug(name)}.png`
}

function getStatTone(value: number) {
  if (value >= 100) {
    return "bg-emerald-400"
  }

  if (value >= 65) {
    return "bg-amber-300"
  }

  return "bg-rose-400"
}

function getTypeTextColor(type: string) {
  return ["Electric", "Ice", "Ground", "Steel", "Fairy", "Normal"].includes(
    type
  )
    ? "#101827"
    : "#ffffff"
}

function TypeBadge({ type }: { type: string }) {
  const background = typeColors[type] ?? "#64748b"

  return (
    <span
      className="inline-flex h-6 items-center rounded-full border border-white/30 px-2.5 text-[0.7rem] font-black uppercase tracking-normal shadow-[inset_0_-1px_0_rgba(0,0,0,0.3),0_0_14px_rgba(255,255,255,0.1)]"
      style={{
        backgroundColor: background,
        color: getTypeTextColor(type),
        textShadow: getTypeTextColor(type) === "#ffffff" ? "0 1px 1px #000" : "none",
      }}
    >
      {type}
    </span>
  )
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean
  direction: SortDirection
}) {
  if (!active) {
    return <ChevronsUpDown className="size-3.5 opacity-40" />
  }

  return direction === "asc" ? (
    <ArrowUp className="size-3.5 text-cyan-200" />
  ) : (
    <ArrowDown className="size-3.5 text-cyan-200" />
  )
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr_2.25rem] items-center gap-3">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
        <div
          className={`h-full rounded-full ${getStatTone(value)} transition-all duration-500`}
          style={{ width: `${Math.min(100, (value / 180) * 100)}%` }}
        />
      </div>
      <span className="text-right text-xs font-semibold tabular-nums text-white">
        {value}
      </span>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  accent,
}: {
  icon: typeof Sparkles
  label: string
  value: string | number
  note: string
  accent: string
}) {
  return (
    <Card className="group rounded-lg border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.09]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardDescription className="text-slate-400">{label}</CardDescription>
            <CardTitle className="mt-2 text-3xl font-black text-white">
              {value}
            </CardTitle>
          </div>
          <div
            className={`rounded-lg border border-white/10 p-2 text-slate-950 shadow-lg ${accent}`}
          >
            <Icon className="size-5" />
          </div>
        </div>
        <p className="text-xs text-slate-400">{note}</p>
      </CardHeader>
    </Card>
  )
}

function PokemonDetail({
  pokemon,
  allPokemon,
  onAnalyzeWithMl,
  onClose,
}: {
  pokemon: PokemonRow
  allPokemon: PokemonRow[]
  onAnalyzeWithMl: (pokemon: PokemonRow) => void
  onClose: () => void
}) {
  const relatedForms = allPokemon
    .filter(
      (entry) =>
        entry.Num === pokemon.Num && entry.Name !== pokemon.Name
    )
    .slice(0, 6)

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/75 p-3 backdrop-blur sm:items-center sm:justify-center sm:p-6">
      <button
        className="absolute inset-0 cursor-default"
        aria-label="Close Pokemon detail"
        onClick={onClose}
      />
      <Card className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border-white/15 bg-slate-950/95 shadow-2xl shadow-cyan-950/40">
        <CardContent className="p-0">
          <div className="grid gap-0 lg:grid-cols-[20rem_1fr]">
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.24),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.4),rgba(2,6,23,1))] p-6">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 text-slate-200 hover:bg-white/10"
                onClick={onClose}
                aria-label="Close detail view"
              >
                <X className="size-4" />
              </Button>
              <div className="mb-4 flex items-center gap-2">
                <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">
                  #{pokemon.Num.toString().padStart(3, "0")}
                </Badge>
                {pokemon.Legendary ? (
                  <Badge className="border-amber-300/30 bg-amber-300/15 text-amber-100">
                    Legendary
                  </Badge>
                ) : null}
              </div>
              <div className="mx-auto flex aspect-square max-w-64 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                <img
                  src={getSpriteUrl(pokemon.Name)}
                  alt={`${pokemon.Name} sprite from PokemonDB`}
                  width={256}
                  height={256}
                  className="h-full w-full object-contain drop-shadow-[0_24px_32px_rgba(34,211,238,0.22)]"
                />
              </div>
              <a
                href={`https://pokemondb.net/sprites/${toSpriteSlug(pokemon.Name).replace(/-mega(?:-[xy])?|-primal$/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block text-center text-xs text-cyan-200 underline-offset-4 hover:underline"
              >
                Sprite source: PokemonDB
              </a>
              <Button
                className="mt-4 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                onClick={() => onAnalyzeWithMl(pokemon)}
              >
                <Sparkles className="size-4" />
                Analyze with ML
              </Button>
              <h2 className="mt-5 text-3xl font-black text-white">
                {pokemon.Name}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <TypeBadge type={pokemon.Type1} />
                {pokemon.Type2 ? <TypeBadge type={pokemon.Type2} /> : null}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
                  <div className="text-lg font-black text-white">
                    {getBaseStatTotal(pokemon)}
                  </div>
                  <div className="text-[0.65rem] uppercase text-slate-400">
                    Total
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
                  <div className="text-lg font-black text-white">
                    {pokemon.Generation}
                  </div>
                  <div className="text-[0.65rem] uppercase text-slate-400">
                    Gen
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
                  <div className="text-lg font-black text-white">
                    {pokemon.Speed}
                  </div>
                  <div className="text-[0.65rem] uppercase text-slate-400">
                    Speed
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-normal text-cyan-100">
                  Battle Profile
                </h3>
                <div className="mt-4 space-y-3">
                  {statColumns.map((stat) => (
                    <StatBar key={stat} label={stat} value={pokemon[stat]} />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <Swords className="mb-3 size-5 text-rose-300" />
                  <div className="text-xl font-black text-white">
                    {pokemon.Attack + pokemon.SpAtk}
                  </div>
                  <p className="text-xs text-slate-400">Combined offense</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <Shield className="mb-3 size-5 text-emerald-300" />
                  <div className="text-xl font-black text-white">
                    {pokemon.Defense + pokemon.SpDef}
                  </div>
                  <p className="text-xs text-slate-400">Combined defense</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <Gauge className="mb-3 size-5 text-cyan-300" />
                  <div className="text-xl font-black text-white">
                    {Math.round(getBaseStatTotal(pokemon) / 6)}
                  </div>
                  <p className="text-xs text-slate-400">Average stat</p>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-normal text-cyan-100">
                    Related Forms
                  </h3>
                  <Sparkles className="size-4 text-amber-200" />
                </div>
                {relatedForms.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relatedForms.map((entry) => (
                      <Badge
                        key={`${entry.Num}-${entry.Name}`}
                        className="border-white/10 bg-white/10 text-slate-100"
                      >
                        {entry.Name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    No alternate or mega forms share this National Dex number in
                    the loaded Supabase dataset.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Home() {
  const predictorRef = useRef<HTMLElement | null>(null)
  const [pokemon, setPokemon] = useState<PokemonRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedGeneration, setSelectedGeneration] = useState("all")
  const [legendaryFilter, setLegendaryFilter] =
    useState<LegendaryFilter>("all")
  const [minAttack, setMinAttack] = useState(0)
  const [minSpeed, setMinSpeed] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>("Num")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPokemon, setSelectedPokemon] = useState<PokemonRow | null>(
    null
  )
  const [predictorInput, setPredictorInput] =
    useState<PredictorInput>(defaultPredictorInput)
  const [predictionResult, setPredictionResult] =
    useState<PredictionResult | null>(null)
  const [predictionError, setPredictionError] = useState<string | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function fetchPokemon() {
      setIsLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase
        .from("pokemon")
        .select(
          "Num, Name, Type1, Type2, HP, Attack, Defense, SpAtk, SpDef, Speed, Generation, Legendary"
        )
        .order("Num", { ascending: true })

      if (!isMounted) {
        return
      }

      if (error) {
        setErrorMessage(error.message)
        setPokemon([])
      } else {
        setPokemon((data ?? []) as PokemonRow[])
      }

      setIsLoading(false)
    }

    fetchPokemon()

    return () => {
      isMounted = false
    }
  }, [])

  const availableTypes = useMemo(
    () =>
      Array.from(
        new Set(pokemon.flatMap((entry) => [entry.Type1, entry.Type2]).filter(Boolean))
      ).sort() as string[],
    [pokemon]
  )

  const predictorTypes = availableTypes.length
    ? availableTypes
    : Object.keys(typeColors).sort()

  const availableGenerations = useMemo(
    () =>
      Array.from(new Set(pokemon.map((entry) => entry.Generation))).sort(
        (a, b) => a - b
      ),
    [pokemon]
  )

  const summary = useMemo(() => {
    const typeCount = new Set(
      pokemon.flatMap((entry) => [entry.Type1, entry.Type2]).filter(Boolean)
    ).size
    const legendaryCount = pokemon.filter((entry) => entry.Legendary).length
    const fastest = pokemon.reduce<PokemonRow | null>(
      (best, entry) => (!best || entry.Speed > best.Speed ? entry : best),
      null
    )

    return { typeCount, legendaryCount, fastest }
  }, [pokemon])

  const filteredPokemon = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return pokemon
      .filter((entry) =>
        normalizedSearch
          ? entry.Name.toLowerCase().includes(normalizedSearch)
          : true
      )
      .filter((entry) =>
        selectedTypes.length > 0
          ? selectedTypes.includes(entry.Type1) ||
            (entry.Type2 ? selectedTypes.includes(entry.Type2) : false)
          : true
      )
      .filter((entry) =>
        selectedGeneration === "all"
          ? true
          : entry.Generation === Number(selectedGeneration)
      )
      .filter((entry) => {
        if (legendaryFilter === "legendary") {
          return entry.Legendary
        }

        if (legendaryFilter === "non-legendary") {
          return !entry.Legendary
        }

        return true
      })
      .filter((entry) => entry.Attack >= minAttack && entry.Speed >= minSpeed)
      .sort((a, b) => {
        const first = getComparableValue(a, sortKey)
        const second = getComparableValue(b, sortKey)
        const direction = sortDirection === "asc" ? 1 : -1

        if (typeof first === "string" && typeof second === "string") {
          return first.localeCompare(second) * direction
        }

        return (Number(first) - Number(second)) * direction
      })
  }, [
    legendaryFilter,
    minAttack,
    minSpeed,
    pokemon,
    searchTerm,
    selectedGeneration,
    selectedTypes,
    sortDirection,
    sortKey,
  ])

  const pageCount = Math.max(1, Math.ceil(filteredPokemon.length / pageSize))
  const effectiveCurrentPage = Math.min(currentPage, pageCount)
  const paginatedPokemon = filteredPokemon.slice(
    (effectiveCurrentPage - 1) * pageSize,
    effectiveCurrentPage * pageSize
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection("asc")
  }

  function toggleType(type: string) {
    setCurrentPage(1)
    setSelectedTypes((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type]
    )
  }

  function resetFilters() {
    setSearchTerm("")
    setSelectedTypes([])
    setSelectedGeneration("all")
    setLegendaryFilter("all")
    setMinAttack(0)
    setMinSpeed(0)
    setSortKey("Num")
    setSortDirection("asc")
  }

  function updatePredictorInput<Key extends keyof PredictorInput>(
    key: Key,
    value: PredictorInput[Key]
  ) {
    setPredictorInput((current) => ({ ...current, [key]: value }))
    setPredictionResult(null)
    setPredictionError(null)
  }

  function analyzePokemonWithMl(entry: PokemonRow) {
    setPredictorInput({
      Type1: entry.Type1,
      Type2: entry.Type2 ?? "",
      HP: entry.HP,
      Attack: entry.Attack,
      Defense: entry.Defense,
      SpAtk: entry.SpAtk,
      SpDef: entry.SpDef,
      Speed: entry.Speed,
      Generation: entry.Generation,
    })
    setPredictionResult(null)
    setPredictionError(null)
    setSelectedPokemon(null)
    window.setTimeout(() => {
      predictorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 0)
  }

  async function handlePredictorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!predictorInput.Type1) {
      setPredictionError("Choose a Type 1 before analyzing.")
      return
    }

    const modalApiUrl = process.env.NEXT_PUBLIC_MODAL_API_URL?.replace(/\/$/, "")

    if (!modalApiUrl) {
      setPredictionError("NEXT_PUBLIC_MODAL_API_URL is not configured.")
      return
    }

    setIsPredicting(true)
    setPredictionError(null)
    setPredictionResult(null)

    try {
      const response = await fetch(`${modalApiUrl}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...predictorInput,
          Type2: predictorInput.Type2 || null,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `Prediction request failed: ${response.status}`)
      }

      const result = (await response.json()) as PredictionResult
      setPredictionResult(result)
    } catch (error) {
      setPredictionError(
        error instanceof Error
          ? error.message
          : "Unable to reach the Legendary Predictor API."
      )
    } finally {
      setIsPredicting(false)
    }
  }

  function formatProbability(value: number) {
    return `${(value * 100).toFixed(1)}%`
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#0f172a] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(45,212,191,0.18),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(248,113,113,0.14),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0),#020617_92%)]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="grid gap-5 rounded-lg border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 backdrop-blur lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-3">
            <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">
              Supabase Pokemon Explorer
            </Badge>
            <div>
              <h1 className="text-4xl font-black tracking-normal text-white sm:text-5xl">
                Pokemon Battle Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Search, sort, filter, and inspect the full Pokemon dataset with
                official artwork, iconic type colors, stat profiles, and
                generation-aware controls.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge className="border-white/10 bg-white/10 text-slate-200">
              {isLoading ? "Loading" : `${filteredPokemon.length} visible`}
            </Badge>
            <Badge className="border-white/10 bg-white/10 text-slate-200">
              {pokemon.length} total rows
            </Badge>
          </div>
        </header>

        {!isLoading && !errorMessage && pokemon.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-3">
            <StatCard
              icon={Sparkles}
              label="Total Pokemon"
              value={pokemon.length}
              note={`${filteredPokemon.length} match the current filters`}
              accent="bg-cyan-300"
            />
            <StatCard
              icon={Zap}
              label="Types Present"
              value={summary.typeCount}
              note={`${selectedTypes.length || "All"} type filters active`}
              accent="bg-amber-300"
            />
            <StatCard
              icon={Crown}
              label="Legendary Pokemon"
              value={summary.legendaryCount}
              note={
                summary.fastest
                  ? `${summary.fastest.Name} leads Speed at ${summary.fastest.Speed}`
                  : "Waiting for data"
              }
              accent="bg-rose-300"
            />
          </section>
        ) : null}

        <section ref={predictorRef}>
          <Card className="rounded-lg border-cyan-300/20 bg-white/[0.06] shadow-2xl shadow-black/20 backdrop-blur">
            <CardHeader className="border-b border-white/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">
                      Modal ML estimate
                    </Badge>
                    <Badge className="border-white/10 bg-white/10 text-slate-300">
                      scikit-learn Pipeline
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-black text-white">
                    Legendary Predictor
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Estimate Legendary status from type, generation, and base
                    stats.
                  </CardDescription>
                </div>
                {predictionResult ? (
                  <Badge
                    className={
                      predictionResult.is_legendary
                        ? "border-amber-300/30 bg-amber-300/15 text-amber-100"
                        : "border-white/10 bg-white/10 text-slate-300"
                    }
                  >
                    {predictionResult.prediction}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <form className="grid gap-5" onSubmit={handlePredictorSubmit}>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                      Type 1
                    </span>
                    <select
                      required
                      value={predictorInput.Type1}
                      onChange={(event) =>
                        updatePredictorInput("Type1", event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none ring-cyan-300/0 transition focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="">Choose a type</option>
                      {predictorTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                      Type 2
                    </span>
                    <select
                      value={predictorInput.Type2}
                      onChange={(event) =>
                        updatePredictorInput("Type2", event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none ring-cyan-300/0 transition focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="">None</option>
                      {predictorTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                      Generation
                    </span>
                    <select
                      value={predictorInput.Generation}
                      onChange={(event) =>
                        updatePredictorInput(
                          "Generation",
                          Number(event.target.value)
                        )
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none ring-cyan-300/0 transition focus:ring-3 focus:ring-cyan-300/20"
                    >
                      {predictorGenerations.map((generation) => (
                        <option key={generation} value={generation}>
                          Generation {generation}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                  {predictorStatFields.map((field) => (
                    <label key={field.key} className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                        {field.label}
                      </span>
                      <input
                        required
                        type="number"
                        min="1"
                        max="255"
                        value={predictorInput[field.key]}
                        onChange={(event) =>
                          updatePredictorInput(field.key, Number(event.target.value))
                        }
                        className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm tabular-nums text-slate-100 outline-none ring-cyan-300/0 transition focus:ring-3 focus:ring-cyan-300/20"
                      />
                    </label>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
                  <Button
                    type="submit"
                    disabled={isPredicting}
                    className="h-10 w-fit bg-cyan-300 px-4 text-slate-950 hover:bg-cyan-200"
                  >
                    {isPredicting ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {isPredicting ? "Analyzing" : "Analyze Pokemon"}
                  </Button>

                  {predictionError ? (
                    <p className="text-sm text-rose-200">{predictionError}</p>
                  ) : predictionResult ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-white">
                          ML prediction: {predictionResult.prediction}
                        </span>
                        <span className="text-cyan-100">
                          Legendary{" "}
                          {formatProbability(
                            predictionResult.legendary_probability
                          )}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
                        <div
                          className="h-full rounded-full bg-cyan-300 transition-all duration-500"
                          style={{
                            width: formatProbability(
                              predictionResult.legendary_probability
                            ),
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-400">
                        Non-Legendary{" "}
                        {formatProbability(
                          predictionResult.non_legendary_probability
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Submit stats to call the deployed Modal FastAPI model.
                    </p>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-lg border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20 backdrop-blur">
          <CardHeader className="border-b border-white/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white">
                  Finder Controls
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Filter by name, type, generation, legendary status, and combat
                  thresholds.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                className="w-fit border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                onClick={resetFilters}
              >
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 p-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                Search by name
              </span>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-slate-100 ring-cyan-300/0 transition focus-within:ring-3 focus-within:ring-cyan-300/20">
                <Search className="size-4 text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Try Charizard, Mewtwo, Pikachu..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-600"
                />
              </div>
            </label>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                Generation
              </span>
              <select
                value={selectedGeneration}
                onChange={(event) => {
                  setSelectedGeneration(event.target.value)
                  setCurrentPage(1)
                }}
                className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none ring-cyan-300/0 transition focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="all">All generations</option>
                {availableGenerations.map((generation) => (
                  <option key={generation} value={generation}>
                    Generation {generation}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                Legendary status
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["all", "All"],
                    ["legendary", "Legendary"],
                    ["non-legendary", "Regular"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={legendaryFilter === value ? "default" : "outline"}
                    className={
                      legendaryFilter === value
                        ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }
                    onClick={() => {
                      setLegendaryFilter(value)
                      setCurrentPage(1)
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                  Type filters
                </span>
                <span className="text-xs text-slate-500">
                  {selectedTypes.length} selected
                </span>
              </div>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    className={`rounded-full transition duration-200 ${
                      selectedTypes.includes(type)
                        ? "scale-105 ring-2 ring-cyan-200"
                        : "opacity-75 hover:opacity-100"
                    }`}
                    onClick={() => toggleType(type)}
                    aria-pressed={selectedTypes.includes(type)}
                  >
                    <TypeBadge type={type} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="space-y-2">
                <span className="flex justify-between text-xs font-semibold uppercase tracking-normal text-slate-400">
                  Minimum Attack
                  <span className="text-cyan-200">{minAttack}</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={minAttack}
                  onChange={(event) => {
                    setMinAttack(Number(event.target.value))
                    setCurrentPage(1)
                  }}
                  className="w-full accent-cyan-300"
                />
              </label>
              <label className="space-y-2">
                <span className="flex justify-between text-xs font-semibold uppercase tracking-normal text-slate-400">
                  Minimum Speed
                  <span className="text-cyan-200">{minSpeed}</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={minSpeed}
                  onChange={(event) => {
                    setMinSpeed(Number(event.target.value))
                    setCurrentPage(1)
                  }}
                  className="w-full accent-cyan-300"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-white/10 bg-slate-950/70 shadow-2xl shadow-black/30 backdrop-blur">
          <CardHeader className="border-b border-white/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white">
                  Pokemon Stats
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Click a row to open the Pokemon Finder detail view.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setCurrentPage(1)
                  }}
                  className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                >
                  {[20, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} per page
                    </option>
                  ))}
                </select>
                <Badge className="border-white/10 bg-white/10 text-slate-300">
                  Page {effectiveCurrentPage} of {pageCount}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex min-h-64 items-center justify-center px-6 text-sm text-slate-400">
                Loading Pokemon from Supabase...
              </div>
            ) : errorMessage ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
                <Badge variant="destructive">Unable to load data</Badge>
                <p className="max-w-xl text-sm text-slate-400">
                  {errorMessage}
                </p>
              </div>
            ) : pokemon.length === 0 ? (
              <div className="flex min-h-64 items-center justify-center px-6 text-sm text-slate-400">
                No records found in pokemon.
              </div>
            ) : filteredPokemon.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
                <Badge className="border-amber-300/30 bg-amber-300/15 text-amber-100">
                  No matches
                </Badge>
                <p className="max-w-xl text-sm text-slate-400">
                  Adjust the filters or reset the finder controls.
                </p>
              </div>
            ) : (
              <>
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow className="border-white/10 bg-white/[0.04] hover:bg-white/[0.04]">
                      {sortableColumns.slice(0, 2).map((column) => (
                        <TableHead key={column.key} className="px-4 py-3 text-slate-300">
                          <button
                            className="inline-flex items-center gap-1.5 font-semibold"
                            onClick={() => toggleSort(column.key)}
                          >
                            {column.label}
                            <SortIcon
                              active={sortKey === column.key}
                              direction={sortDirection}
                            />
                          </button>
                        </TableHead>
                      ))}
                      <TableHead className="min-w-40 px-4 py-3 text-slate-300">
                        Type
                      </TableHead>
                      {sortableColumns.slice(2).map((column) => (
                        <TableHead
                          key={column.key}
                          className="px-4 py-3 text-right text-slate-300"
                        >
                          <button
                            className="inline-flex items-center justify-end gap-1.5 font-semibold"
                            onClick={() => toggleSort(column.key)}
                          >
                            {column.label}
                            <SortIcon
                              active={sortKey === column.key}
                              direction={sortDirection}
                            />
                          </button>
                        </TableHead>
                      ))}
                      <TableHead className="px-4 py-3 text-slate-300">
                        Legendary
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPokemon.map((entry) => (
                      <TableRow
                        key={`${entry.Num}-${entry.Name}`}
                        className="cursor-pointer border-white/10 transition duration-200 hover:bg-cyan-300/10"
                        onClick={() => setSelectedPokemon(entry)}
                      >
                        <TableCell className="px-4 py-3 font-semibold tabular-nums text-slate-300">
                          {entry.Num}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-bold text-white">
                          <div className="flex items-center gap-3">
                            <img
                              src={getSpriteUrl(entry.Name)}
                              alt={`${entry.Name} sprite`}
                              width={42}
                              height={42}
                              className="size-10 object-contain"
                            />
                            <span>{entry.Name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <TypeBadge type={entry.Type1} />
                            {entry.Type2 ? <TypeBadge type={entry.Type2} /> : null}
                          </div>
                        </TableCell>
                        {statColumns.map((stat) => (
                          <TableCell
                            key={`${entry.Num}-${entry.Name}-${stat}`}
                            className="px-4 py-3 text-right tabular-nums text-slate-300"
                          >
                            {entry[stat]}
                          </TableCell>
                        ))}
                        <TableCell className="px-4 py-3 text-right font-black tabular-nums text-cyan-100">
                          {getBaseStatTotal(entry)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right tabular-nums text-slate-300">
                          {entry.Generation}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            className={
                              entry.Legendary
                                ? "border-amber-300/30 bg-amber-300/15 text-amber-100"
                                : "border-white/10 bg-white/10 text-slate-300"
                            }
                          >
                            {entry.Legendary ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex flex-col gap-3 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-400">
                    Showing {(effectiveCurrentPage - 1) * pageSize + 1}-
                    {Math.min(
                      effectiveCurrentPage * pageSize,
                      filteredPokemon.length
                    )}{" "}
                    of {filteredPokemon.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={effectiveCurrentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                      onClick={() =>
                        setCurrentPage((page) => Math.min(pageCount, page + 1))
                      }
                      disabled={effectiveCurrentPage === pageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedPokemon ? (
        <PokemonDetail
          pokemon={selectedPokemon}
          allPokemon={pokemon}
          onAnalyzeWithMl={analyzePokemonWithMl}
          onClose={() => setSelectedPokemon(null)}
        />
      ) : null}
    </main>
  )
}
