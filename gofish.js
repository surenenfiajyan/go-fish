export default class GoFish {
	#newGameButtonEl = document.getElementById('newGameBtn');
	#difficultySelectEl = document.getElementById('difficultySelect');
	#opponentCardsEl = document.getElementById('opponentCards');
	#opponentFishesEl = document.getElementById('opponentFishes');
	#fullDeckEl = document.getElementById('fullDeck');
	#yourFishesEl = document.getElementById('yourFishes');
	#yourCardsEl = document.getElementById('yourCards');
	#popup = document.getElementById('popup');
	#minimumKnownYourCards = {};
	#maximumKnownCardsLeftInDeck = {};
	#previousOpponentGuesses = {};
	#difficultyLevel = -1;
	#blockEvents = false;
	#clickAttempts = 0;
	#soundContext = new AudioContext();
	#soundBuffer = null;
	#firstTime = true;
	#yourTurn = false;
	#message = document.createElement('div');
	#yourInputReject = null;
	#cardNames = {
		'A': 'aces',
		'2': 'twos',
		'3': 'threes',
		'4': 'fours',
		'5': 'fives',
		'6': 'sixes',
		'7': 'sevens',
		'8': 'eights',
		'9': 'nines',
		'10': 'tens',
		'J': 'jacks',
		'Q': 'queens',
		'K': 'kings',
	};
	#difficultyLevels = {
		'easy': 1,
		'medium': 2,
		'hard': 3,
		'god': 4,
	};

	constructor() {
		this.#message.classList.add('message');
		const blocker = e => {
			if (this.#turnOffEvents) {
				e.preventDefault();
				e.stopPropagation();
				++this.#clickAttempts;
			}
		};

		window.addEventListener('click', blocker, true);
		window.addEventListener('change', blocker, true);
		window.addEventListener('input', blocker, true);
		window.addEventListener('keydown', blocker, true);
		window.addEventListener('focus', blocker, true);
		window.addEventListener('mousedown', blocker, true);

		this.#newGameButtonEl.onclick = e => {
			this.#showDialog('Start a new game?', () => {
				this.newGame();
			}, () => {

			});
		};

		this.#difficultySelectEl.value = localStorage.getItem('difficulty') ?? 'medium';
		this.#difficultySelectEl.value = this.#difficultySelectEl.value ? this.#difficultySelectEl.value : 'medium';

		this.#difficultySelectEl.onchange = e => {
			localStorage.setItem('difficulty', e.target.value);

			this.#showDialog('The difficulty will be applied only in the next game, would you like to start a new game?', () => {
				this.newGame();
			}, () => {

			});
		};
	}

	get #turnOffEvents() {
		return this.#blockEvents;
	}

	set #turnOffEvents(block) {
		this.#blockEvents = !!block;

		if (this.#blockEvents) {
			document.body.classList.add('wait');
		} else {
			this.#clickAttempts = 0;
			document.body.classList.remove('wait');
		}
	}

	#calculateDuration(ms) {
		if (this.#clickAttempts >= 2) {
			return 0;
		}

		return ms;
	}

	async #initSound() {
		const response = await fetch('card.mp3');
		const arrayBuffer = await response.arrayBuffer();
		this.#soundBuffer = await this.#soundContext.decodeAudioData(arrayBuffer);
	}

	async newGame() {
		if (this.#firstTime) {
			this.#firstTime = false;

			await this.#initSound();

			this.#showDialog('Welcome to Go Fish game!', () => {
				this.newGame();
			});

			return;
		}

		this.#yourInputReject?.('Started new game');
		this.#yourTurn = Math.random() < 0.5;
		this.#turnOffEvents = true;
		this.#difficultyLevel = this.#difficultyLevels[this.#difficultySelectEl.value];
		this.#minimumKnownYourCards = Object.fromEntries(Object.keys(this.#cardNames).map(k => [k, 0]));
		this.#previousOpponentGuesses = Object.fromEntries(Object.keys(this.#cardNames).map(k => [k, 0]));
		this.#maximumKnownCardsLeftInDeck = Object.fromEntries(Object.keys(this.#cardNames).map(k => [k, 4]));
		this.#opponentFishesEl.innerHTML = this.#yourFishesEl.innerHTML = this.#yourCardsEl.innerHTML = this.#opponentCardsEl.innerHTML = '';

		const allCards = Object.keys(this.#minimumKnownYourCards).flatMap(level => [
			{ type: 'hearts', level },
			{ type: 'diamonds', level },
			{ type: 'spades', level },
			{ type: 'clubs', level }
		]);

		this.#shuffle(allCards);
		this.#fullDeckEl.innerHTML = allCards.map(x => `<div class="full-deck-card"><div class="card-back" data-type="${x.type}" data-level="${x.level}"></div></div>`).join('');

		for (let i = 0; i < 7; ++i) {
			const card = this.#pickCardFromDeck();
			await this.#addToCardsFromDeck(this.#yourCardsEl, card);
		}

		for (let i = 0; i < 7; ++i) {
			const card = this.#pickCardFromDeck();
			await this.#addToCardsFromDeck(this.#opponentCardsEl, card);
		}

		await this.#checkForCopleteBlocks();
		await this.#cleanupLeftovers();

		try {
			do {
				await this.#processTurn();
			} while (true);
		} catch (e) {
			console.log(e);
		}
	}

	#showDialog(message, onAccept = null, onDecline = null) {
		this.#popup.returnValue = onDecline ? 'no' : 'yes';
		this.#popup.querySelector('.message').innerText = message;
		this.#popup.showModal();
		const [yesButton, noButton] = this.#popup.querySelectorAll('button');

		yesButton.innerText = onDecline ? 'Yes' : 'OK';
		noButton.style.display = onDecline ? '' : 'none';

		this.#popup.onclose = e => {
			if (e.target.returnValue === 'yes') {
				onAccept?.();
			} else {
				onDecline?.();
			}
		}
	}

	#pickCardFromDeck() {
		return this.#fullDeckEl.lastElementChild?.firstElementChild;
	}

	async #addToCardsFromDeck(cardsEl, card) {
		const duration = 150;
		const group = this.#getGroup(card.dataset.level, cardsEl);
		const deckBox = card.getBoundingClientRect();
		const groupBox = (cardsEl === this.#opponentCardsEl ? this.#opponentCardsEl : group).getBoundingClientRect();
		card.style.transition = `all linear ${this.#calculateDuration(duration)}ms`;
		card.style.transform = 'translateY(-90%)';
		card.style.left = `${groupBox.x - deckBox.x}px`;
		card.style.top = `${groupBox.y - deckBox.y}px`;
		this.#makeSwipeSound();
		await this.#wait(duration);
		card.style.transition = card.style.left = card.style.top = card.style.transform = '';
		card.classList.replace('card-back', 'card');
		card.parentElement.classList.replace('full-deck-card', 'play-card');
		group.append(card.parentElement);
	}

	async #checkForCopleteBlocks(yourCardIsKnown = false) {
		for (const group of [...this.#yourCardsEl.querySelectorAll('.group:has(:nth-child(4))')]) {
			if (yourCardIsKnown) {
				this.#minimumKnownYourCards[group.dataset.level] = 0;
				this.#maximumKnownCardsLeftInDeck[group.dataset.level] = 0;
			}
			await this.#addToFish(group);
		}

		for (const group of [...this.#opponentCardsEl.querySelectorAll('.group:has(:nth-child(4))')]) {
			this.#maximumKnownCardsLeftInDeck[group.dataset.level] = 0;
			this.#minimumKnownYourCards[group.dataset.level] = 0;
			await this.#addToFish(group);
		}

		this.#updateInfo();
	}

	async #addToFish(group) {
		const duration = 150;
		const your = this.#yourCardsEl.contains(group);
		const groupBox = (your ? group : this.#opponentCardsEl).getBoundingClientRect();
		const fishBox = (your ? this.#yourFishesEl : this.#opponentFishesEl).getBoundingClientRect();

		const [destinationX, destinationY] = your ? [fishBox.right - 100, fishBox.bottom] : [fishBox.left, fishBox.top];
		const dx = destinationX - groupBox.x;
		const dy = destinationY - groupBox.y;
		const cards = [...group.querySelectorAll('.card')];


		if (your) {
			for (const card of cards) {
				card.style.transition = `all linear ${this.#calculateDuration(duration)}ms`;
				card.style.left = `${dx}px`;
				card.style.top = `${dy}px`;
				card.style.transform = 'translateY(-90%) rotate3d(1, 0, 1, 0deg)';
				await this.#wait(duration);
				this.#makeSwipeSound();
				card.classList.replace('card', 'card-back');
				card.style.left = card.style.top = '';
				card.parentElement.classList.replace('play-card', 'fish-card');
				this.#yourFishesEl.append(card.parentElement);
				await this.#wait(duration / 10);
				card.style.transform = '';
			}
		} else {
			for (const card of cards) {
				card.style.transition = `all linear ${this.#calculateDuration(duration)}ms`;
				card.style.left = `${-dx}px`;
				card.style.top = `${-dy}px`;
				card.style.transform = 'translateY(-90%) rotate3d(1, 0, 1, 0deg)';
				card.classList.replace('card', 'card-back');
				card.parentElement.classList.replace('play-card', 'fish-card');
				this.#opponentFishesEl.append(card.parentElement);
				await this.#wait(duration);
				this.#makeSwipeSound();
				await this.#wait(duration / 10);
				card.style.transform = card.style.left = card.style.top = '';
			}
		}
	}

	#findGroup(level, cardsEl) {
		return cardsEl.querySelector(`[data-level="${level}"]`);
	}

	#getGroup(level, cardsEl) {
		let group = this.#findGroup(level, cardsEl);

		if (!group) {
			group = document.createElement('div');
			group.classList.add('group');
			group.dataset.level = level;
			cardsEl.append(group);
		}

		return group;
	}

	#makeSwipeSound() {
		const source = this.#soundContext.createBufferSource();
		source.buffer = this.#soundBuffer;
		source.connect(this.#soundContext.destination);
		source.start();
	}

	async #wait(ms) {
		while (ms > 0) {
			const time = Math.min(ms, 200);
			const actualTime = this.#calculateDuration(time);
			ms -= time;
			await new Promise(resolve => setTimeout(resolve, actualTime));
			this.#clickAttempts = Math.max(0, this.#clickAttempts - actualTime / 500);
		}
	}

	async #processTurn() {
		this.#turnOffEvents = true;

		const opponentFishes = this.#opponentFishesEl.children.length / 4;
		const yourFishes = this.#yourFishesEl.children.length / 4;

		if (opponentFishes > 6) {
			this.#turnOffEvents = false;
			this.#showDialog('You lost!', () => {
				this.newGame();
			});

			throw 'You lost!';
		}

		if (yourFishes > 6) {
			this.#turnOffEvents = false;
			this.#showDialog('You won!', () => {
				this.newGame();
			});

			throw 'You won!';
		}

		if (this.#yourTurn) {
			await this.#processYourGuess();
		} else {
			await this.#processOpponentGuess();
		}
	}

	#shuffle(arr) {
		for (let i = 0; i < arr.length; ++i) {
			const r = Math.floor(Math.random() * arr.length);
			[arr[i], arr[r]] = [arr[r], arr[i]];
		}
	}

	#generateOpponentGuess() {
		const opponentCards = this.#getOpponentCards();
		const guesses = Object.keys(opponentCards).filter(guess => opponentCards[guess]);

		if (this.#difficultyLevel === 4) {
			const yourCards = this.#getYourCards();

			for (const guess of guesses) {
				if (yourCards[guess] && opponentCards[guess] + yourCards[guess] < 4) {
					this.#previousOpponentGuesses[guess]++;
					return guess;
				}
			}

			for (const guess of guesses) {
				if (opponentCards[guess] + yourCards[guess] === 4) {
					this.#previousOpponentGuesses[guess]++;
					return guess;
				}
			}
		}

		if (this.#difficultyLevel >= 3) {
			this.#shuffle(guesses);

			for (const guess of guesses) {
				if (this.#minimumKnownYourCards[guess] === 3) {
					this.#previousOpponentGuesses[guess]++;
					return guess;
				}
			}

			for (const guess of guesses) {
				if (this.#minimumKnownYourCards[guess] === 2) {
					this.#previousOpponentGuesses[guess]++;
					return guess;
				}
			}

			for (const guess of guesses) {
				if (this.#minimumKnownYourCards[guess] === 1) {
					this.#previousOpponentGuesses[guess]++;
					return guess;
				}
			}
		}

		guesses.sort((g1, g2) => {
			const v1 = this.#minimumKnownYourCards[g1] + opponentCards[g1] - this.#previousOpponentGuesses[g1];
			const v2 = this.#minimumKnownYourCards[g2] + opponentCards[g2] - this.#previousOpponentGuesses[g2];

			return v1 > v2 ? -1 : 1;
		});

		if (this.#difficultyLevel === 1) {
			return guesses.at(-1);
		}

		const idx = Math.min(Math.floor(Math.pow(5, Math.random()) - 1), guesses.length - 1);
		const guess = guesses.at(idx);

		if (guess && this.#difficultyLevel >= 3) {
			this.#previousOpponentGuesses[guess]++;
		}

		return guess;
	}

	async #processOpponentGuess() {
		const guess = this.#generateOpponentGuess();
		this.#yourTurn = true;

		if (guess) {
			await this.#showMessage(`Any ${this.#cardNames[guess]}?`, false);
			const group = this.#findGroup(guess, this.#yourCardsEl);
			const count = group?.children.length ?? 0;
			this.#minimumKnownYourCards[guess] = 0;

			if (count > 0) {
				this.#yourTurn = false;
				await this.#passCards(group);
			} else {
				await this.#showMessage(`No, go fish`, true);
			}
		}

		if (this.#yourTurn) {
			const card = this.#pickCardFromDeck();

			if (card) {
				await this.#addToCardsFromDeck(this.#opponentCardsEl, card);
				this.#yourTurn = card.dataset.level !== guess;
			}
		}

		await this.#checkForCopleteBlocks();
	}

	async #processYourGuess() {
		const guess = await this.#waitForYourGuess();

		if (guess) {
			await this.#showMessage(`Have any ${this.#cardNames[guess]}?`, true);
		}

		const group = this.#findGroup(guess ?? '--', this.#opponentCardsEl);
		const count = group?.children.length ?? 0;

		if (guess && !this.#minimumKnownYourCards[guess]) {
			this.#minimumKnownYourCards[guess] = 1;
		}

		if (guess) {
			this.#previousOpponentGuesses[guess] = 0;
		}

		if (count > 0) {
			this.#minimumKnownYourCards[guess] += count;
			await this.#passCards(group);
			await this.#checkForCopleteBlocks();
		} else {
			await this.#showMessage(`Go fish`, false);
			this.#yourTurn = await this.#waitForYourFish(guess ?? '--');
			const card = this.#pickCardFromDeck();

			if (card) {
				if (this.#yourTurn) {
					this.#minimumKnownYourCards[guess]++;
				}

				await this.#addToCardsFromDeck(this.#yourCardsEl, card);
			}

			await this.#checkForCopleteBlocks(this.#yourTurn);
		}
	}

	#getOpponentCards() {
		const opponentCards = Object.fromEntries(Object.entries(this.#cardNames).map(e => [e[0], 0]));
		this.#opponentCardsEl.querySelectorAll('.card').forEach(card => opponentCards[card.dataset.level]++);
		return opponentCards;
	}

	#getYourCards() {
		const yourCards = Object.fromEntries(Object.entries(this.#cardNames).map(e => [e[0], 0]));
		this.#yourCardsEl.querySelectorAll('.card').forEach(card => yourCards[card.dataset.level]++);
		return yourCards;
	}

	#getYourCardsCount() {
		return this.#yourCardsEl.querySelectorAll('.card').length;
	}

	#updateInfo() {
		const yourCardsCount = this.#getYourCardsCount();
		const opponentCards = this.#getOpponentCards();
		const cardsLeftInDeck = this.#fullDeckEl.children.length;

		for (const level in opponentCards) {
			this.#minimumKnownYourCards[level] = Math.min(
				this.#minimumKnownYourCards[level],
				yourCardsCount,
			)

			this.#maximumKnownCardsLeftInDeck[level] = Math.min(
				this.#maximumKnownCardsLeftInDeck[level],
				4 - opponentCards[level] - this.#minimumKnownYourCards[level],
				cardsLeftInDeck,
			)

			this.#minimumKnownYourCards[level] = Math.max(
				this.#minimumKnownYourCards[level],
				4 - opponentCards[level] - this.#maximumKnownCardsLeftInDeck[level],
			)
		}
	}

	#waitForYourFish(lastGuess) {
		return new Promise((resolve, reject) => {
			const card = this.#pickCardFromDeck();

			if (!card) {
				resolve(false);
			}

			this.#turnOffEvents = false;
			this.#yourInputReject = reject;

			this.#addCardClickListener(card, c => {
				this.#yourInputReject = null;
				this.#turnOffEvents = true;

				this.#cleanupLeftovers().then(() => {
					resolve(c.dataset.level === lastGuess);
				});
			});
		});
	}

	#waitForYourGuess() {
		return new Promise((resolve, reject) => {
			const cards = this.#yourCardsEl.querySelectorAll('.group > :last-child .card');

			if (!cards.length) {
				resolve();
				return;
			}

			this.#turnOffEvents = false;
			this.#yourInputReject = reject;

			cards.forEach(card => {
				this.#addCardClickListener(card, c => {
					this.#yourInputReject = null;
					this.#turnOffEvents = true;

					this.#cleanupLeftovers().then(() => {
						resolve(c.dataset.level);
					});
				});
			});
		});
	}

	#addCardClickListener(card, callback) {
		card.tabIndex = 0;
		card.style.cursor = 'pointer';
		card.onclick = () => callback(card);
		card.onkeydown = e => {
			if (e.key === "Enter") {
				callback(card);
			}
		};
	}

	async #showMessage(message, your, duration = 2000) {
		this.#message.innerText = message;
		(your ? this.#yourCardsEl : this.#opponentCardsEl).append(this.#message);
		await this.#wait(duration);
		this.#message.remove();
	}

	async #cleanupLeftovers() {
		await this.#wait(150);
		document.querySelectorAll('.card, .card-back').forEach(card => {
			card.style.transition = card.style.cursor = '';
			card.removeAttribute('tabindex');
			card.onclick = card.onkeydown = null;
		});
	}

	async #passCards(sourceGroup) {
		const duration = 150;
		const your = this.#yourCardsEl.contains(sourceGroup);
		const destinationCardEl = your ? this.#opponentCardsEl : this.#yourCardsEl;
		const destinationGroup = this.#getGroup(sourceGroup.dataset.level, destinationCardEl);
		const sourceBox = (your ? sourceGroup : this.#opponentCardsEl).getBoundingClientRect();
		const destinationBox = (your ? this.#opponentCardsEl : destinationGroup).getBoundingClientRect();

		const dx = sourceBox.x - destinationBox.x;
		const dy = sourceBox.y - destinationBox.y;

		const cards = [...sourceGroup.querySelectorAll('.card')];

		if (your) {
			for (const card of cards) {
				card.style.transition = `all linear ${this.#calculateDuration(duration)}ms`;
				card.style.left = `${-dx}px`;
				card.style.top = `${-dy}px`;
				await this.#wait(duration);
				this.#makeSwipeSound();
				destinationGroup.append(card.parentElement);
				await this.#wait(duration / 10);
				card.style.left = card.style.top = '';
			}
		} else {
			for (const card of cards) {
				card.parentElement.remove();
				card.style.transition = `all linear ${this.#calculateDuration(duration)}ms`;
				card.style.left = `${dx}px`;
				card.style.top = `${dy}px`;
				destinationGroup.append(card.parentElement);
				await this.#wait(duration / 10);
				card.style.left = card.style.top = '';
				await this.#wait(duration);
				this.#makeSwipeSound();
			}
		}
	}
}