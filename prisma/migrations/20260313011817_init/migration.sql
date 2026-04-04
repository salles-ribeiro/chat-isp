-- CreateTable
CREATE TABLE "canais" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'usuario',
    "autor" TEXT,
    "texto" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canalId" INTEGER NOT NULL,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canais_slug_key" ON "canais"("slug");

-- CreateIndex
CREATE INDEX "mensagens_canalId_criadaEm_idx" ON "mensagens"("canalId", "criadaEm");

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
