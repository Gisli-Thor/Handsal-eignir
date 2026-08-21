// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Draft contract PDFs for e-signing (SPEC §11): kauptilboð pre-filled from
 * the accepted offer, kaupsamningur/afsal skeletons pre-filled with parties.
 * All clearly watermarked DRÖG — real legal templates come from the customer
 * (SPEC §15 guardrail: no invented legal text).
 *
 * Icelandic-only legal documents (same decision as the söluyfirlit).
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9.5,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 46,
    color: "#1a1d23",
  },
  watermark: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 110,
    fontWeight: "bold",
    color: "#e2e2e2",
    transform: "rotate(-30deg)",
  },
  draftNote: {
    fontSize: 7.5,
    color: "#a33",
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: "bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbb",
    paddingBottom: 2,
  },
  row: { flexDirection: "row", paddingVertical: 1.5 },
  label: { width: "38%", color: "#666", fontSize: 8.5 },
  value: { width: "62%" },
  body: { lineHeight: 1.5 },
  amount: { fontSize: 13, fontWeight: "bold", marginTop: 2 },
  amountWords: { fontSize: 8.5, color: "#555" },
  signatures: { marginTop: 44 },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  signatureBox: {
    width: "45%",
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    paddingTop: 3,
    fontSize: 8,
    color: "#555",
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 46,
    right: 46,
    fontSize: 7,
    color: "#888",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export interface ContractParty {
  name: string;
  kennitala: string | null;
  sharePct?: string | null;
}

export interface ContractBaseData {
  tenantName: string;
  addressLine: string;
  locality: string;
  fastanumer: string | null;
  printedDate: string;
  sellers: ContractParty[];
  buyers: ContractParty[];
}

function PartyRows({ parties }: { parties: ContractParty[] }) {
  return (
    <>
      {parties.map((party, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.value}>
            {party.name}
            {party.sharePct ? ` (${party.sharePct}%)` : ""}
          </Text>
          <Text style={[styles.label, { width: "38%" }]}>
            {party.kennitala ? `kt. ${party.kennitala}` : ""}
          </Text>
        </View>
      ))}
      {parties.length === 0 ? <Text style={styles.label}>—</Text> : null}
    </>
  );
}

function DraftFrame({
  title,
  data,
  children,
  signatureLabels,
}: {
  title: string;
  data: ContractBaseData;
  children: React.ReactNode;
  signatureLabels: [string, string];
}) {
  return (
    <Document title={`${title} — ${data.addressLine} (DRÖG)`} producer="Handsal" creator="Handsal">
      <Page size="A4" style={styles.page}>
        <Text style={styles.watermark} fixed>
          DRÖG
        </Text>
        <Text style={styles.draftNote}>
          DRÖG — skjal þetta er sjálfvirkt útbúin drög úr Handsal og er ekki endanlegur
          löggerningur. Prentað {data.printedDate}.
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {data.addressLine}, {data.locality}
          {data.fastanumer ? ` — fastanúmer ${data.fastanumer}` : ""}
        </Text>

        <Text style={styles.sectionTitle}>Seljandi</Text>
        <PartyRows parties={data.sellers} />
        <Text style={styles.sectionTitle}>Kaupandi</Text>
        <PartyRows parties={data.buyers} />

        {children}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signatureRow}>
            <View style={styles.signatureBox}>
              <Text>{signatureLabels[0]}</Text>
            </View>
            <View style={styles.signatureBox}>
              <Text>{signatureLabels[1]}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.tenantName} · Handsal (DRÖG)</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ── Kauptilboð (from the accepted offer) ─────────────────────────────────────

export interface KauptilbodData extends ContractBaseData {
  amount: string;
  amountWords: string;
  gildistimi: string;
  afhending: string | null;
  paymentItems: Array<{ description: string; amount: string; dueDate: string | null }>;
  fyrirvarar: Array<{ type: string; description: string; deadline: string }>;
  terms: string | null;
  soluyfirlitLine: string | null;
}

export function KauptilbodDocument({ data }: { data: KauptilbodData }) {
  return (
    <DraftFrame
      title="Kauptilboð"
      data={data}
      signatureLabels={["Undirskrift tilboðsgjafa (kaupanda)", "Samþykki seljanda"]}
    >
      <Text style={styles.sectionTitle}>Kaupverð</Text>
      <Text style={styles.amount}>{data.amount}</Text>
      <Text style={styles.amountWords}>Heildarverð í bókstöfum: {data.amountWords} krónur</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Gildistími tilboðs</Text>
        <Text style={styles.value}>{data.gildistimi}</Text>
      </View>
      {data.afhending ? (
        <View style={styles.row}>
          <Text style={styles.label}>Afhendingardagur</Text>
          <Text style={styles.value}>{data.afhending}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Greiðslutilhögun</Text>
      {data.paymentItems.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={[styles.value, { width: "62%" }]}>
            {index + 1}. {item.description}
            {item.dueDate ? ` — ${item.dueDate}` : ""}
          </Text>
          <Text style={[styles.label, { width: "38%", textAlign: "right", color: "#1a1d23" }]}>
            {item.amount}
          </Text>
        </View>
      ))}

      {data.fyrirvarar.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Fyrirvarar</Text>
          {data.fyrirvarar.map((fyrirvari, index) => (
            <Text key={index} style={styles.body}>
              • {fyrirvari.type}: {fyrirvari.description} (frestur {fyrirvari.deadline})
            </Text>
          ))}
        </View>
      ) : null}

      {data.terms ? (
        <View>
          <Text style={styles.sectionTitle}>Aðrir skilmálar</Text>
          <Text style={styles.body}>{data.terms}</Text>
        </View>
      ) : null}

      {data.soluyfirlitLine ? (
        <Text style={[styles.body, { marginTop: 8 }]}>{data.soluyfirlitLine}</Text>
      ) : null}
    </DraftFrame>
  );
}

// ── Kaupsamningur / afsal skeletons ──────────────────────────────────────────

export interface SkeletonContractData extends ContractBaseData {
  amount: string | null;
  amountWords: string | null;
}

export function KaupsamningurDocument({ data }: { data: SkeletonContractData }) {
  return (
    <DraftFrame
      title="Kaupsamningur"
      data={data}
      signatureLabels={["Undirskrift seljanda", "Undirskrift kaupanda"]}
    >
      {data.amount ? (
        <View>
          <Text style={styles.sectionTitle}>Kaupverð</Text>
          <Text style={styles.amount}>{data.amount}</Text>
          {data.amountWords ? (
            <Text style={styles.amountWords}>
              Heildarverð í bókstöfum: {data.amountWords} krónur
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>Efni samnings</Text>
      <Text style={styles.body}>
        [Drög — samningsákvæði samkvæmt sniðmáti fasteignasölunnar koma hér. Endanlegur
        texti er á ábyrgð löggilts fasteignasala.]
      </Text>
    </DraftFrame>
  );
}

export function AfsalDocument({ data }: { data: SkeletonContractData }) {
  return (
    <DraftFrame
      title="Afsal"
      data={data}
      signatureLabels={["Undirskrift seljanda (afsalsgjafa)", "Undirskrift kaupanda (afsalshafa)"]}
    >
      {data.amount ? (
        <View>
          <Text style={styles.sectionTitle}>Kaupverð</Text>
          <Text style={styles.amount}>{data.amount}</Text>
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>Yfirlýsing</Text>
      <Text style={styles.body}>
        [Drög — afsalstexti samkvæmt sniðmáti fasteignasölunnar kemur hér. Endanlegur
        texti er á ábyrgð löggilts fasteignasala.]
      </Text>
    </DraftFrame>
  );
}

// The signature page appended by the webhook lives in src/lib/pdf/
// signature-page.tsx (vertical-agnostic — the core webhook processor uses it).
