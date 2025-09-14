<template>
  <v-app>
    <v-container class="py-4">

      <!-- Header with file upload -->
      <v-card class="mb-4" variant="tonal">
        <v-card-title class="d-flex align-center">
          <span class="text-h6 me-auto">Spotify History</span>
          <v-file-input
            label="Load your Spotify JSON files"
            accept=".json"
            multiple
            prepend-icon="mdi-file-upload"
            density="comfortable"
            variant="outlined"
            hide-details
            @update:model-value="onFilesFromVuetify"
            style="min-width: 320px"
          />
        </v-card-title>
        <!-- <v-card-subtitle class="px-4 pb-4">
          Use <code>StreamingHistory*.json</code> or <code>endsong_*.json</code> from your export.
        </v-card-subtitle> -->
      </v-card>

      <!-- Timeline card -->
      <v-card class="mb-4" elevation="8">
        <v-card-text class="pa-0 position-relative" style="overflow:hidden;">
          <ListeningCloud
            v-if="points.length"
            :points="points"
            :domain="domain"
            :selected-artist="selectedArtist"
            :selected-track="selectedTrack"
            :x-scale="xScale"
            :y-scale="yScale"
          />
          <div v-else class="pa-4 text-medium-emphasis">No data loaded yet.</div>

          <!-- bottom-left overlay: number of points -->
          <div
            v-if="points.length"
            class="text-caption text-medium-emphasis"
            style="position:absolute; left:8px; bottom:8px;"
          >
            Displaying {{ points.length.toLocaleString() }} data points
          </div>
        </v-card-text>
      </v-card>

      <v-row dense class="mb-2">
        <v-col cols="12" md="6">
          <v-slider v-model="xScale" min="0.2" max="3" step="0.05"
                    label="Day spacing (X scale)" thumb-label />
        </v-col>
        <v-col cols="12" md="6">
          <v-slider v-model="yScale" min="0.2" max="3" step="0.05"
                    label="Horizontal spacing (Y scale)" thumb-label />
        </v-col>
      </v-row>

      <!-- Bottom row -->
      <v-row dense>
        <!-- Top Artists -->
        <v-col cols="12" lg="6">
          <v-card class="h-100" variant="tonal">
            <v-card-title class="text-subtitle-1 d-flex align-center">
              Top Artists
              <v-spacer />
              <v-chip
                v-if="selectedArtist || selectedTrack"
                size="small" variant="elevated" color="primary"
                class="ms-2" @click="clearFilter"
              >Clear filter</v-chip>
            </v-card-title>
            <v-divider />
            <v-card-text class="pa-0">
              <v-list v-if="topArtists.length" lines="one" density="comfortable">
                <v-list-item
                  v-for="a in topArtists"
                  :key="a.name"
                  :ripple="false"
                  :active="a.name === selectedArtist && !selectedTrack"
                  color="primary"
                  rounded="lg"
                  @click="selectArtist(a.name)"
                >
                  <v-list-item-title class="text-truncate">{{ a.rank }}. {{ a.name }}</v-list-item-title>
                  <template #append>
                    <v-chip size="small" color="primary" variant="flat" class="pointer-events-none">
                      {{ a.count.toLocaleString() }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="pa-4 text-medium-emphasis text-caption">Load files to see your top artists.</div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Top Tracks by … -->
        <v-col cols="12" lg="6">
          <v-card class="h-100" variant="tonal">
            <v-card-title class="text-subtitle-1">
              Top Tracks<span v-if="selectedArtist"> by {{ selectedArtist }}</span>
            </v-card-title>
            <v-divider />
            <v-card-text class="pa-0">
              <v-list v-if="selectedArtist && topTracksBySelected.length" lines="one" density="comfortable">
                <v-list-item
                  v-for="t in topTracksBySelected"
                  :key="t.track"
                  :ripple="false"
                  :active="t.track === selectedTrack"
                  color="primary"
                  rounded="lg"
                  @click="selectTrack(t.track)"
                >
                  <v-list-item-title class="text-truncate">{{ t.rank }}. {{ t.track }}</v-list-item-title>
                  <template #append>
                    <v-chip size="small" color="primary" variant="flat" class="pointer-events-none">
                      {{ t.count.toLocaleString() }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="pa-4 text-medium-emphasis text-caption">
                Click an artist on the left to see their most-played tracks.
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-app>
</template>

<script setup>
import { ref, computed } from 'vue'
import ListeningCloud from './components/ListeningCloud.vue'
import { readFiles, playsToPoints } from './lib/parseSpotify'

const plays = ref([])
const points = ref([])
const domain = ref({ x0: 0, x1: 1, y0: 0, y1: 24, t0: 0 })

const selectedArtist = ref(null)
const selectedTrack  = ref(null)

const xScale = ref(1)
const yScale = ref(1)

async function onFilesFromVuetify(files) {
  if (!files || !files.length) return
  plays.value = await readFiles(files)
  const mapped = playsToPoints(plays.value)
  points.value = mapped.points
  domain.value = mapped
  clearFilter()
}

function selectArtist(name) {
  selectedArtist.value = name
  selectedTrack.value = null            // artist filter takes over
}

function selectTrack(track) {
  selectedTrack.value = track           // track filter overrides artist
}

function clearFilter() {
  selectedArtist.value = null
  selectedTrack.value = null
}

const topArtists = computed(() => {
  if (!plays.value.length) return []
  const counts = new Map()
  for (const p of plays.value) counts.set(p.artist, (counts.get(p.artist) || 0) + 1)
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 20)
    .map((a, i) => ({ ...a, rank: i + 1 }))
})

const topTracksBySelected = computed(() => {
  const artist = selectedArtist.value
  if (!artist) return []
  const counts = new Map()
  for (const p of plays.value) if (p.artist === artist) counts.set(p.track, (counts.get(p.track) || 0) + 1)
  return Array.from(counts, ([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count).slice(0, 20)
    .map((t, i) => ({ ...t, rank: i + 1 }))
})
</script>

<style>
.pointer-events-none { pointer-events: none; } /* keeps chips unclickable */
</style>