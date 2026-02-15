const STARTER_REGIONS = {
  kanto: {
    name: "Kanto",
    starters: [
      { id: 1, name: "Bulbasaur" },
      { id: 4, name: "Charmander" },
      { id: 7, name: "Squirtle" }
    ]
  },
  johto: {
    name: "Johto",
    starters: [
      { id: 152, name: "Chikorita" },
      { id: 155, name: "Cyndaquil" },
      { id: 158, name: "Totodile" }
    ]
  },
  hoenn: {
    name: "Hoenn",
    starters: [
      { id: 252, name: "Treecko" },
      { id: 255, name: "Torchic" },
      { id: 258, name: "Mudkip" }
    ]
  },
  sinnoh: {
    name: "Sinnoh",
    starters: [
      { id: 387, name: "Turtwig" },
      { id: 390, name: "Chimchar" },
      { id: 393, name: "Piplup" }
    ]
  },
  unova: {
    name: "Unova",
    starters: [
      { id: 495, name: "Snivy" },
      { id: 498, name: "Tepig" },
      { id: 501, name: "Oshawott" }
    ]
  },
  kalos: {
    name: "Kalos",
    starters: [
      { id: 650, name: "Chespin" },
      { id: 653, name: "Fennekin" },
      { id: 656, name: "Froakie" }
    ]
  },
  alola: {
    name: "Alola",
    starters: [
      { id: 722, name: "Rowlet" },
      { id: 725, name: "Litten" },
      { id: 728, name: "Popplio" }
    ]
  },
  galar: {
    name: "Galar",
    starters: [
      { id: 810, name: "Grookey" },
      { id: 813, name: "Scorbunny" },
      { id: 816, name: "Sobble" }
    ]
  }
};

function getAllStarters() {
  const all = [];
  for (const region of Object.values(STARTER_REGIONS)) {
    all.push(...region.starters);
  }
  return all;
}

module.exports = { STARTER_REGIONS, getAllStarters };
