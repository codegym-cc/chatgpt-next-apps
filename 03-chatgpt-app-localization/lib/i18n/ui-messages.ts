import type { SupportedLocale } from "./supported-locales";

export type UiMessages = Record<string, unknown>;

export const UI_MESSAGES: Record<SupportedLocale, UiMessages> = {
  "en-US": {
    common: {
      loading: "Loading…",
      errorTitle: "Error",
      retry: "Retry",
      emptyToolOutputTitle: "No data yet",
      emptyToolOutputText: "Call the tool in ChatGPT to see the widget.",
      generatedAt: "Generated",
      localeFallback: "Requested locale {requested} is not supported. Using {resolved}.",
    },

    day: {
      title: "Weather",
      today: "Today",
      tomorrow: "Tomorrow",
      summary: "Summary",
      slots: "Day parts",
      current: "Now",
      feelsLike: "Feels like",
      min: "Min",
      max: "Max",
      wind: "Wind",
      precipitation: "Precipitation",
      partOfDay: {
        morning: "Morning",
        day: "Day",
        evening: "Evening",
        night: "Night",
      },
    },

    week: {
      title: "7-day forecast",
      minMax: "Min / Max",
    },

    context: {
      title: "Resolved context",
      place: "Place",
      locale: "Locale",
      locationSource: "Location source",
      timezone: "Time zone",
      units: "Units",
      country: "Country",
      locationUsed: {
        input: "Input",
        userLocation: "User location",
        fallback: "Fallback",
      },
      unitsUsed: {
        metric: "Metric",
        imperial: "Imperial",
      },
    },

    units: {
      tempC: "°C",
      tempF: "°F",
      windMps: "m/s",
      windMph: "mph",
    },

    toolError: {
      title: "Tool error",
    },
  },

  "ru-RU": {
    common: {
      loading: "Загрузка…",
      errorTitle: "Ошибка",
      retry: "Повторить",
      emptyToolOutputTitle: "Пока нет данных",
      emptyToolOutputText: "Вызовите tool в ChatGPT, чтобы увидеть виджет.",
      generatedAt: "Сформировано",
      localeFallback: "Локаль {requested} не поддержана. Используем {resolved}.",
    },

    day: {
      title: "Погода",
      today: "Сегодня",
      tomorrow: "Завтра",
      summary: "Сводка",
      slots: "Части дня",
      current: "Сейчас",
      feelsLike: "Ощущается как",
      min: "Мин",
      max: "Макс",
      wind: "Ветер",
      precipitation: "Осадки",
      partOfDay: {
        morning: "Утро",
        day: "День",
        evening: "Вечер",
        night: "Ночь",
      },
    },

    week: {
      title: "Прогноз на 7 дней",
      minMax: "Мин / Макс",
    },

    context: {
      title: "Контекст (как понял сервер)",
      place: "Место",
      locale: "Локаль",
      locationSource: "Источник локации",
      timezone: "Часовой пояс",
      units: "Единицы",
      country: "Страна",
      locationUsed: {
        input: "Ввод",
        userLocation: "Геолокация",
        fallback: "По умолчанию",
      },
      unitsUsed: {
        metric: "Метрические",
        imperial: "Имперские",
      },
    },

    units: {
      tempC: "°C",
      tempF: "°F",
      windMps: "м/с",
      windMph: "mph",
    },

    toolError: {
      title: "Ошибка инструмента",
    },
  },

  "de-DE": {
    common: {
      loading: "Laden…",
      errorTitle: "Fehler",
      retry: "Erneut versuchen",
      emptyToolOutputTitle: "Noch keine Daten",
      emptyToolOutputText: "Rufe das Tool in ChatGPT auf, um das Widget zu sehen.",
      generatedAt: "Erzeugt",
      localeFallback: "Angeforderte Locale {requested} wird nicht unterstützt. Verwende {resolved}.",
    },

    day: {
      title: "Wetter",
      today: "Heute",
      tomorrow: "Morgen",
      summary: "Übersicht",
      slots: "Tagesabschnitte",
      current: "Jetzt",
      feelsLike: "Gefühlt",
      min: "Min",
      max: "Max",
      wind: "Wind",
      precipitation: "Niederschlag",
      partOfDay: {
        morning: "Morgen",
        day: "Tag",
        evening: "Abend",
        night: "Nacht",
      },
    },

    week: {
      title: "7‑Tage‑Vorschau",
      minMax: "Min / Max",
    },

    context: {
      title: "Kontext (Server-Auflösung)",
      place: "Ort",
      locale: "Locale",
      locationSource: "Quelle",
      timezone: "Zeitzone",
      units: "Einheiten",
      country: "Land",
      locationUsed: {
        input: "Eingabe",
        userLocation: "Benutzerstandort",
        fallback: "Fallback",
      },
      unitsUsed: {
        metric: "Metrisch",
        imperial: "Imperial",
      },
    },

    units: {
      tempC: "°C",
      tempF: "°F",
      windMps: "m/s",
      windMph: "mph",
    },

    toolError: {
      title: "Tool-Fehler",
    },
  },
} as const;